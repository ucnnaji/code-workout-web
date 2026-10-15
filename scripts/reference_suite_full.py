#!/usr/bin/env python3
"""Independent offline execution oracles for PracticeBridge sets 1-6 A/B.
This verifies target computational behavior (labels), not whether students satisfy stylistic requirements.
"""
import json, math, random, subprocess, tempfile, pathlib, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=json.loads((ROOT/'questions.seed.json').read_text())
QS={q['id']:q for q in DATA}
# source uses STDIN in each task's specified order; stdout labels are intentionally extracted from last line
PY={
'1A':'''import random
x=random.randint(20,60)
y=int(input())
d=abs(x-y)
print('Exact' if d==0 else 'Very Close' if d<=3 else 'Close' if d<=7 else 'Far')
if y!=x:print('above' if y>x else 'below')''',
'1B':'''import random
x=random.randint(30,90)
y=int(input())
d=abs(x-y)
print('Exact' if d==0 else 'Very close' if d<=2 else 'Close' if d<=5 else 'Far' if d<=10 else 'Very far')''',
'2A':'''a=float(input());b=float(input());c=float(input());d=float(input())
g=a/b;fuel=g*c;total=round(fuel+d,2)
print('Low Cost' if total<40 else 'Moderate Cost' if total<80 else 'High Cost' if total<150 else 'Very High Cost')''',
'2B':'''p=float(input());n=int(input());f=float(input());s=p*n
r=.15 if s>=200 else .10 if s>=100 else .05 if s>=50 else 0
print(round(s-s*r+f,2))''',
'3A':'''s=int(input());l=int(input())
if l<=s:l=int(input())
e=int(input());d=int(input())
print('short' if d<=s else 'long' if d<=l else 'extension' if d<=l+e else 'out')''',
'3B':'''s=int(input());l=int(input())
if l<=s:l=int(input())
e=int(input());d=int(input())
print('short' if d<=s else 'long' if d<=l else 'extension' if d<=l+e else 'out')''',
'4A':'''from math import hypot
x=float(input());y=float(input());d=float(input());u=float(input());v=float(input());e=float(input());a=float(input());b=float(input());c=float(input())
z=hypot(x-u,y-v)-(d+e)/2
print('short' if z<=a else 'medium' if z<=b else 'long' if z<=c else 'out')''',
'4B':'''from math import hypot
x=float(input());y=float(input());d=float(input());u=float(input());v=float(input());e=float(input());a=float(input());b=float(input());c=float(input())
z=hypot(x-u,y-v)-(d+e)/2
print('short' if z<=a else 'medium' if z<=b else 'long' if z<=c else 'out')''',
'5A':'''p=int(input());b=int(input());d=float(input())
print('cart' if p<=2 and b<=2 and d<=5 else 'van' if p<=6 and b<=8 and d<=50 else 'shuttle' if p<=14 and b<=20 else 'out')''',
'5B':'''p=int(input());c=int(input())
print('A' if p<=20 and c<=10 else 'B' if p<=40 and c<=25 else 'C' if p<=80 and c<=50 else 'out')''',
'6A':'''l=float(input());w=float(input());h=float(input());m=float(input());d=float(input());v=l*w*h
print('standard' if v<=1000 and m<=20 and d<=100 else 'large' if v<=5000 and m<=60 and d<=300 else 'freight' if v<=15000 and m<=150 else 'special')''',
'6B':'''l=float(input());w=float(input());h=float(input());m=float(input());v=l*w*h
print('small' if v<=1200 and m<=20 else 'medium' if v<=3500 and m<=50 else 'large' if v<=8000 and m<=100 else 'special')'''
}
JAVA_BODY={
'1A':'int target=20; int estimate=i.nextInt(); int d=Math.abs(target-estimate); System.out.println(d==0?"Exact":d<=3?"Very Close":d<=7?"Close":"Far"); if(estimate!=target)System.out.println(estimate>target?"above":"below");',
'1B':'int target=30; int estimate=i.nextInt(); int d=Math.abs(target-estimate); System.out.println(d==0?"Exact":d<=2?"Very close":d<=5?"Close":d<=10?"Far":"Very far");',
'2A':'double a=i.nextDouble(), b=i.nextDouble(), c=i.nextDouble(), d=i.nextDouble(); double total=Math.round((a/b*c+d)*100.0)/100.0; System.out.println(total<40?"Low Cost":total<80?"Moderate Cost":total<150?"High Cost":"Very High Cost");',
'2B':'double p=i.nextDouble(); int n=i.nextInt(); double fee=i.nextDouble(); double s=p*n; double r=s>=200?.15:s>=100?.10:s>=50?.05:0; System.out.println(Math.round((s-s*r+fee)*100.0)/100.0);',
'3A':'int s=i.nextInt(),l=i.nextInt(); if(l<=s)l=i.nextInt(); int e=i.nextInt(),d=i.nextInt(); System.out.println(d<=s?"short":d<=l?"long":d<=l+e?"extension":"out");',
'3B':'int s=i.nextInt(),l=i.nextInt(); if(l<=s)l=i.nextInt(); int e=i.nextInt(),d=i.nextInt(); System.out.println(d<=s?"short":d<=l?"long":d<=l+e?"extension":"out");',
'4A':'double x=i.nextDouble(),y=i.nextDouble(),diam=i.nextDouble(),u=i.nextDouble(),v=i.nextDouble(),diam2=i.nextDouble(),a=i.nextDouble(),b=i.nextDouble(),c=i.nextDouble(); double z=Math.hypot(x-u,y-v)-(diam+diam2)/2; System.out.println(z<=a?"short":z<=b?"medium":z<=c?"long":"out");',
'4B':'double x=i.nextDouble(),y=i.nextDouble(),diam=i.nextDouble(),u=i.nextDouble(),v=i.nextDouble(),diam2=i.nextDouble(),a=i.nextDouble(),b=i.nextDouble(),c=i.nextDouble(); double z=Math.hypot(x-u,y-v)-(diam+diam2)/2; System.out.println(z<=a?"short":z<=b?"medium":z<=c?"long":"out");',
'5A':'int p=i.nextInt(),b=i.nextInt(); double d=i.nextDouble(); System.out.println(p<=2&&b<=2&&d<=5?"cart":p<=6&&b<=8&&d<=50?"van":p<=14&&b<=20?"shuttle":"out");',
'5B':'int p=i.nextInt(),c=i.nextInt(); System.out.println(p<=20&&c<=10?"A":p<=40&&c<=25?"B":p<=80&&c<=50?"C":"out");',
'6A':'double l=i.nextDouble(),w=i.nextDouble(),h=i.nextDouble(),m=i.nextDouble(),d=i.nextDouble(),v=l*w*h; System.out.println(v<=1000&&m<=20&&d<=100?"standard":v<=5000&&m<=60&&d<=300?"large":v<=15000&&m<=150?"freight":"special");',
'6B':'double l=i.nextDouble(),w=i.nextDouble(),h=i.nextDouble(),m=i.nextDouble(),v=l*w*h; System.out.println(v<=1200&&m<=20?"small":v<=3500&&m<=50?"medium":v<=8000&&m<=100?"large":"special");'
}
CASES={
'1A':[['20'],['60'],['42']], '1B':[['30'],['90'],['45']],
'2A':[['100','25','3','0'],['500','25','4','0'],['800','20','5','5'],['100','10','4','0'],['200','10','4','0'],['300','10','5','0']],
'2B':[['10','4','3'],['10','5','3'],['10','10','3'],['10','20','3'],['10','21','3']],
'3A':[['10','20','5','10'],['10','20','5','20'],['10','20','5','25'],['10','20','5','26'],['10','8','20','5','23']],
'3B':[['10','20','5','10'],['10','20','5','20'],['10','20','5','25'],['10','20','5','26'],['10','8','20','5','23']],
'4A':[['0','0','2','10','0','2','3','7','9'],['0','0','2','10','0','2','8','9','10'],['0','0','2','20','0','2','3','7','9']],
'4B':[['0','0','2','10','0','2','3','7','9'],['0','0','2','10','0','2','8','9','10'],['0','0','2','20','0','2','3','7','9']],
'5A':[['2','2','5'],['3','2','5'],['6','8','50'],['14','20','100'],['15','1','1']],
'5B':[['20','10'],['21','10'],['40','25'],['80','50'],['81','10']],
'6A':[['10','10','10','20','100'],['10','10','10','21','100'],['10','10','50','60','300'],['10','10','150','150','999'],['20','20','40','151','1']],
'6B':[['10','10','12','20'],['10','10','12','21'],['10','10','35','50'],['20','20','20','100'],['20','20','21','100']]
}
result=[]
with tempfile.TemporaryDirectory() as td:
 td=pathlib.Path(td)
 for family,source in PY.items():
  assert 'PB-PY-'+family in QS and 'PB-JA-'+family in QS
  (td/'Main.java').write_text('import java.util.*; public class Main { public static void main(String[] args){ Scanner i=new Scanner(System.in); '+JAVA_BODY[family]+' } }')
  compile=subprocess.run(['javac','Main.java'],cwd=td,capture_output=True,text=True,timeout=15)
  if compile.returncode: raise RuntimeError(family+': '+compile.stderr)
  for case in CASES[family]:
   stdin='\n'.join(case)+'\n'
   pr=subprocess.run([sys.executable,'-c',source],input=stdin,capture_output=True,text=True,timeout=5)
   jr=subprocess.run(['java','Main'],cwd=td,input=stdin,capture_output=True,text=True,timeout=5)
   p=pr.stdout.strip().splitlines(); j=jr.stdout.strip().splitlines()
   ok=pr.returncode==0 and jr.returncode==0 and p==j
   result.append({'family':family,'input':case,'python':p,'java':j,'pass':ok,'python_error':pr.stderr,'java_error':jr.stderr})
   if not ok: print('FAIL',family,case,p,j,pr.stderr,jr.stderr)
print(json.dumps({'scenarios':len(result),'passed':sum(r['pass'] for r in result),'failed':sum(not r['pass'] for r in result)},indent=2))
(ROOT/'test-results').mkdir(exist_ok=True)
(ROOT/'test-results'/'reference_cross_language.json').write_text(json.dumps(result,indent=2))
assert all(r['pass'] for r in result)
