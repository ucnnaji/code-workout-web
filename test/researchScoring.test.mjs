import test from "node:test";
import assert from "node:assert/strict";
import { responseHash, normalizeOutput, validateRubric, validateScoringResult, buildFormativeInstructions, buildStudentEvaluationFeedback } from "../lib/researchScoring.mjs";

test("responseHash is stable and changes when response changes", () => {
  const base = { questionId: "Q1", rubricVersion: "v1", promptVersion: "p1", model: "m1", code: "print(1)", explanation: "" };
  assert.equal(responseHash(base), responseHash(base));
  assert.notEqual(responseHash(base), responseHash({ ...base, code: "print(2)" }));
  assert.notEqual(responseHash(base), responseHash({ ...base, rubricVersion: "v2" }));
  assert.notEqual(responseHash(base), responseHash({ ...base, promptVersion: "p2" }));
  assert.notEqual(responseHash(base), responseHash({ ...base, model: "m2" }));
});

test("normalizeOutput removes platform line ending and trailing-space differences", () => {
  assert.equal(normalizeOutput("a  \r\nb\r\n"), "a\nb");
});

test("validateRubric enforces complete anchors", () => {
  const rubric = validateRubric({ criteria: [{ id: "C1", label: "Decision", max_score: 2, anchors: { "0": "wrong", "1": "partial", "2": "correct" } }] }, "r1");
  assert.equal(rubric.max_score, 2);
  assert.throws(() => validateRubric({ criteria: [{ id: "C1", label: "Decision", max_score: 2, anchors: { "0": "wrong", "2": "correct" } }] }), /missing anchor 1/);
});

test("validateScoringResult recomputes total instead of trusting model total", () => {
  const rubric = validateRubric({ criteria: [
    { id: "C1", label: "A", max_score: 2, anchors: { "0": "x", "1": "y", "2": "z" } },
    { id: "C2", label: "B", max_score: 2, anchors: { "0": "x", "1": "y", "2": "z" } }
  ] });
  const out = validateScoringResult({ criteria: [{ id: "C1", score: 2, evidence: "ok" }, { id: "C2", score: 1, evidence: "partial" }], total_score: 99 }, rubric);
  assert.equal(out.total_score, 3);
  assert.equal(out.max_score, 4);
});

test("formative prompt is problem-solving support and forbids scoring/solutions", () => {
  const prompt = buildFormativeInstructions("python");
  assert.match(prompt, /NOT a grading or scoring interaction/);
  assert.match(prompt, /Do not provide a complete solution/);
  assert.match(prompt, /Maximum 70 words/);
});

test("student evaluation feedback is deterministic and non-solution-bearing", () => {
  assert.equal(buildStudentEvaluationFeedback([{score:2,max_score:2},{score:1,max_score:2},{score:0,max_score:2}]), "1 of 3 rubric criteria fully met. 1 partially met. 1 not yet met. Review the task requirements and revise the criteria that are not yet fully satisfied.");
});

test("validateRubric rejects malformed hidden tests", () => {
  assert.throws(() => validateRubric({ criteria: [{ id: "C1", label: "A", max_score: 1, anchors: { "0": "x", "1": "y" } }], hidden_tests: [{ stdin: 3, expected_stdout: "x" }] }), /Hidden test 1/);
});
