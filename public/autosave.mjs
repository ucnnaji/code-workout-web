/** Serial saves, compare-and-swap revisions and stable IDs across ambiguous retries. */
export class SaveQueue {
    constructor({ revision = 0, save, onStatus = () => { }, onAck = () => { } }) {
        this.revision = revision;
        this.save = save;
        this.onStatus = onStatus;
        this.onAck = onAck;
        this.version = 0;
        this.acked = 0;
        this.value = null;
        this.pending = null;
        this.conflict = false;
        this.attempt = null;
    }
    set(value) { this.value = structuredClone(value); this.version++; this.onStatus('dirty'); }
    get dirty() { return this.version > this.acked; }
    async flush() {
        if (this.pending)
            return this.pending;
        if (!this.dirty)
            return;
        if (this.conflict)
            throw new Error('A newer draft exists. Copy your unsaved work before reloading.');
        this.pending = (async () => {
            while (this.dirty) {
                this.attempt ||= { version: this.version, value: structuredClone(this.value), id: crypto.randomUUID() };
                const attempt = this.attempt;
                this.onStatus('saving');
                try {
                    const r = await this.save(attempt.value, this.revision, attempt.id);
                    this.revision = r.revision;
                    this.acked = attempt.version;
                    this.attempt = null;
                    this.onAck(attempt.value, this.revision, attempt.version);
                    this.onStatus(this.dirty ? 'dirty' : 'saved');
                }
                catch (e) {
                    this.conflict = e.status === 409;
                    this.onStatus(this.conflict ? 'conflict' : 'error', e);
                    throw e;
                }
            }
        })();
        try {
            return await this.pending;
        }
        finally {
            this.pending = null;
        }
    }
}
