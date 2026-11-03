"""Extract biodata fields and page evidence locally; use Tesseract for image text.
No document content is sent to an external service. Extracted claims need review.
"""
import csv
import datetime as dt
import io
import json
import re
import shutil
import subprocess
import sys
import fitz

COUNTRIES = ['Singapore', 'Indonesia', 'Myanmar', 'Malaysia', 'Saudi Arabia', 'United Arab Emirates', 'UAE', 'Hong Kong', 'Taiwan', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'Philippines', 'India', 'Dubai']
NATIONALITIES = {'indonesian':'Indonesian', 'indonesia':'Indonesian', 'myanmar':'Myanmar', 'burmese':'Myanmar', 'filipino':'Filipino', 'filipina':'Filipino', 'philippines':'Filipino', 'indian':'Indian', 'india':'Indian', 'sri lankan':'Sri Lankan', 'bangladeshi':'Bangladeshi'}

def rows_from_words(words):
    rows = []
    for x0, y0, x1, y1, text in sorted(words, key=lambda w: ((w[1]+w[3])/2, w[0])):
        cy = (y0+y1)/2
        row = next((r for r in rows[-5:] if abs(r['y']-cy)<4.5), None)
        if row is None:
            row = {'y':cy, 'words':[]}
            rows.append(row)
        row['words'].append((x0, text))
    return [' '.join(t for _, t in sorted(r['words'])) for r in sorted(rows, key=lambda r:r['y'])]

def ocr_page(page):
    image = page.get_pixmap(matrix=fitz.Matrix(2.5,2.5), alpha=False)
    result = subprocess.run(['tesseract', 'stdin', 'stdout', '--psm', '3', 'tsv'], input=image.tobytes('png'), capture_output=True, timeout=35)
    if result.returncode: raise RuntimeError('OCR could not read this page')
    words = []
    for r in csv.DictReader(io.StringIO(result.stdout.decode('utf-8', errors='replace')), delimiter='\t', quoting=csv.QUOTE_NONE):
        text=(r.get('text') or '').strip()
        if text and float(r.get('conf','-1'))>=30:
            x,y,w,h=[float(r[k])/2.5 for k in ['left','top','width','height']]
            words.append((x,y,x+w,y+h,text))
    return rows_from_words(words)


def extract_pdf(filename):
    doc=fitz.open(filename)
    if doc.needs_pass: raise ValueError('Password-protected PDF. Upload an unlocked copy.')
    if len(doc)>25: raise ValueError('PDF has more than 25 pages. Split it into individual candidate profiles.')
    pages=[]; records=[]; warnings=[]; fields={}; evidence={}; conflicts=[]
    ocr_available=bool(shutil.which('tesseract'))
    for i,page in enumerate(doc):
        native=rows_from_words([(*w[:4],w[4]) for w in page.get_text('words')])
        text='\n'.join(native)
        pages.append({'page':i+1,'text':text[:25000]})
        records.append({'page':i+1,'method':'PDF text','rows':native})
        # Images may contain values even when a PDF's form labels are text.
        need_ocr=len(text.strip())<150 or bool(page.get_images()) or page.get_text().count('Name:')>0
        if need_ocr:
            if ocr_available:
                try:
                    lines=ocr_page(page)
                    pages[-1]['ocrText']='\n'.join(lines)[:25000]
                    records.append({'page':i+1,'method':'OCR','rows':lines})
                except (subprocess.TimeoutExpired,RuntimeError,ValueError): warnings.append(f'Page {i+1}: OCR failed or timed out; check the original.')
            else: warnings.append(f'Page {i+1}: image text may be missing. Install Tesseract to enable OCR.')
    def put(key,value,record,snippet):
        if value is None or value=='' or value==[]:return
        if key in fields:
            if isinstance(value,dict) and isinstance(fields[key],dict):
                for part,val in value.items():
                    if part not in fields[key]:fields[key][part]=val
                    elif fields[key][part]!=val:conflicts.append({'field':key+'.'+part,'value':fields[key][part],'alternative':val,'page':record['page'],'method':record['method']})
                return
            if str(fields[key]).casefold()!=str(value).casefold() and not any(c['field']==key and c['alternative']==value for c in conflicts):
                conflicts.append({'field':key,'value':fields[key],'alternative':value,'page':record['page'],'method':record['method']})
            return
        fields[key]=value
        evidence[key]={'page':record['page'],'method':record['method'],'text':snippet[:450]}
    def clean(s):return re.sub(r'^[\s|\[\]{}:;,]+|[\s|\[\]{};,]+$','',s).strip()
    def value_for(line,label):
        m=re.search(r'(?:^|\b)(?:'+label+r')\s*[:\-]\s*(.*)$',line,re.I)
        if not m:return None
        val=clean(m[1]);return val if val and not re.match(r'^\d+\.\s*\w',val) else None
    def number(s):
        s=re.sub(r'[^\d.]','',s)
        try:return float(s) if '.' in s else int(s)
        except ValueError:return None
    for record in records:
        lines=record['rows']; text='\n'.join(lines)
        for line in lines:
            val=value_for(line,r'(?:full\s+)?name|name\s+of\s+(?:fdw|helper|maid)')
            if val and 2<len(val)<70 and not re.search(r'\d|\b(?:port|airport|agency|employer|registration|signature|birth|code)\b',val,re.I): put('name',val,record,line)
            for key,label in [('nationality',r'nationality'),('religion',r'religion'),('marital',r'marital\s+status'),('education',r'education(?:\s+level)?'),('placeOfBirth',r'place\s+of\s+birth'),('referenceCode',r'ref(?:erence)?\.?\s*code'),('dietaryRestrictions',r'dietary\s+restrictions')]:
                val=value_for(line,label)
                if val:
                    if key=='nationality':val=NATIONALITIES.get(val.lower(),val)
                    if key=='marital':val={'divorce':'Divorced','divorced':'Divorced','single':'Single','married':'Married','widow':'Widowed','widowed':'Widowed','separated':'Separated'}.get(val.lower(),val)
                    if len(val)<160:put(key,val,record,line)
            val=value_for(line,r'(?:number|no\.?)\s+of\s+siblings')
            if val:
                m=re.match(r'(\d{1,2})\b',val)
                if m and int(m[1])<=30:put('siblings',int(m[1]),record,line)
            val=value_for(line,r'(?:number|no\.?)\s+of\s+(?:children|kids)')
            if val:
                m=re.match(r'(\d{1,2})\b',val)
                if m and int(m[1])<=30:put('childrenCount',int(m[1]),record,line)
                elif val.lower() in ['nil','none','no','-']:put('childrenCount',0,record,line)
            val=value_for(line,r'age\(?s?\)?\s+of\s+(?:children|kids)(?:\s*\(if any\))?')
            if val and re.fullmatch(r'[\d\s,;&/\.\-a-zA-Z()]+',val):
                ages=[float(x) if '.' in x else int(x) for x in re.findall(r'\d+(?:\.\d+)?',val)]
                if ages and all(a<=80 for a in ages):put('children',ages,record,line)
            m=re.search(r'\bage\s*:\s*([\d\s|\[\]{}]+)',line,re.I)
            if m:
                age=number(m[1])
                if age and 18<=age<=100:put('age',age,record,line)
            m=re.search(r'(?:date\s+of\s+birth|\bd\.?o\.?b\.?)\s*:\s*(.*?)(?:\bage\b|$)',line,re.I)
            if m:
                raw=m[1]; birth=None
                for fmt in ['%d/%m/%Y','%d-%m-%Y','%Y-%m-%d','%d.%m.%Y','%d %b %Y','%d %B %Y']:
                    try:birth=dt.datetime.strptime(clean(raw),fmt).date();break
                    except ValueError:pass
                if birth is None:
                    digits=re.sub(r'\D','',raw)
                    if len(digits) in [6,8]:
                        try:
                            day,month=int(digits[:2]),int(digits[2:4]);year=int(digits[4:])
                            if len(digits)==6:year+=2000 if year<=dt.date.today().year%100 else 1900
                            birth=dt.date(year,month,day)
                        except ValueError:pass
                if birth and 18<=(dt.date.today()-birth).days/365.25<=100:put('dob',birth.isoformat(),record,line)
            m=re.search(r'height\s*(?:&|and|/)\s*weight\s*:\s*(.*?)\bcm\b(.*?)(?:\bkg\b|$)',line,re.I)
            if m:
                height,weight=number(m[1]),number(m[2])
                if height and 100<=height<=230:put('height_cm',height,record,line)
                if weight and 25<=weight<=250:put('weight_kg',weight,record,line)
            for key,label,lo,hi in [('height_cm','height',100,230),('weight_kg','weight',25,250)]:
                m=re.search(r'\b'+label+r'(?:\s*\([^)]*\))?\s*:\s*(\d+(?:\.\d+)?)',line,re.I)
                if m and lo<=float(m[1])<=hi:put(key,float(m[1]),record,line)
            m=re.search(r'(?:preference\s+for\s+rest\s+day|rest\s+days?(?:\s*(?:per|/)\s*month)?)\s*:\s*(\d{1,2})\b',line,re.I)
            if m and int(m[1])<=31:put('restDays',int(m[1]),record,line)
            m=re.search(r'(?:basic\s+|monthly\s+|expected\s+)?salary\s*(?:\([^)]*\))?\s*[:\-]?\s*(?:S\$|SGD|\$)?\s*(\d{3,4})\b',line,re.I)
            if m:put('salary',int(m[1]),record,line)
            # Avoid treating an agency's address or experience label as a spoken language.
            if re.search(r'\b(?:english|eng)\b',line,re.I):
                level=None
                if re.search(r'\b(?:no|cannot speak|not speaking)\s+english\b',line,re.I):level='none'
                elif re.search(r'\bfluent\b',line,re.I):level='fluent'
                elif re.search(r'\b(?:conversational|good|fair)\b',line,re.I):level='conversational'
                elif re.search(r'\b(?:basic|simple|little|learning)\b',line,re.I):level='basic'
                if level:put('english',level,record,line)
            if re.search(r'\b(?:pet|dog|cat)\b',line,re.I):
                if re.search(r'not afraid|comfortable|can (?:handle|care)|willing.*(?:pet|dog|cat)',line,re.I):put('pets',True,record,line)
                elif re.search(r'\bafraid\b|not comfortable',line,re.I):put('pets',False,record,line)
            m=re.search(r'(?:total\s+)?(?:years?\s+of\s+experience|experience\s*\(years?\))\s*:\s*(\d+(?:\.\d+)?)',line,re.I)
            if m and float(m[1])<=70:put('years',float(m[1]),record,line)
            m=re.search(r'(?:available\s+(?:from|date)|earliest\s+start\s+date)\s*:\s*(\d{4}-\d{2}-\d{2})',line,re.I)
            if m:
                try:dt.date.fromisoformat(m[1]);put('availableFrom',m[1],record,line)
                except ValueError:pass
        # Employment history: take dated rows, preserving duties rather than inventing them.
        jobs=[]
        if re.search(r'employment\s+history|work\s+(?:history|experience)',text,re.I):
            for i,line in enumerate(lines):
                m=re.match(r'^\s*((?:19|20)\d{2})\s*(?:[|–—/-]\s*)?((?:19|20)\d{2})\b(.*)',line)
                if not m:continue
                start,end=int(m[1]),int(m[2])
                if not 1970<=start<=end<=dt.date.today().year+1:continue
                tail=m[3];following=[]
                for other in lines[i+1:i+4]:
                    if re.search(r'^(?:C\d|\d{4}|Previous working|Feedback|Employment History)',other,re.I):break
                    following.append(other)
                detail=' '.join([tail,*following]).strip()
                country=next((c for c in COUNTRIES if re.search(r'\b'+re.escape(c)+r'\b',detail,re.I)),None)
                job={'from':start,'to':end,'period':f'{start}–{end}','country':country or 'Not stated','duties':detail[:600],'exit':'unknown','singapore':country=='Singapore','page':record['page']}
                # Child ages are read only from explicit care descriptions.
                ages=[]
                for a,unit in re.findall(r'(\d+(?:\.\d+)?)\s*(months?|mths?|years?|yrs?)\s*(?:old|baby|child|children)',detail,re.I):
                    age=float(a)/(12 if unit.lower().startswith(('month','mth')) else 1)
                    if age<=18:ages.append(age)
                if ages:job['kid_ages']=ages;job['child_care']=True
                if re.search(r'elderly|ahkong|ahma|aged parent',detail,re.I):job['elderly']=True
                jobs.append(job)
            if jobs:put('jobs',jobs,record,'\n'.join(lines)[:450])
        # Form skill tables distinguish willingness, claimed experience and absent evidence.
        if re.search(r'skills\s+of|areas\s+of\s+work',text,re.I):
            care={};willing={}
            groups=[('Child',r'care\s+of\s+infants?/children|care\s+of\s+children'),('Elderly',r'care\s+of\s+elderly'),('Disability',r'care\s+of\s+disabled')]
            for category,pattern in groups:
                start=next((i for i,l in enumerate(lines) if re.search(pattern,l,re.I)),None)
                if start is None:continue
                section=[]
                for l in lines[start:start+8]:
                    if section and re.search(r'^\s*\d[. ]+\s*(?:Care|General|Cooking|Language)',l,re.I):break
                    section.append(l)
                chunk=' '.join(section);decisions=re.findall(r'\b(?:Yes|No)\b',chunk,re.I)
                if decisions:willing[category]=decisions[0].lower()=='yes'
                if len(decisions)>=2:care[category]=decisions[1].lower()=='yes'
                if re.search(r'\bwilling\b',chunk,re.I):care[category]=None
                if category=='Child':care['Infant']=None
            if care:put('careEvidence',care,record,'; '.join(f'{k}: {v}' for k,v in care.items()))
            if willing:put('willingness',willing,record,'Skills table willingness column')
        # Spoken languages are collected from the language section, not nationality.
        language_lines=[]
        for i,line in enumerate(lines):
            if re.search(r'language abilities|languages?(?:\s*\(spoken\))?\s*:|(?:english|mandarin|cantonese|tamil|hindi)\s*:',line,re.I):
                language_lines.extend(lines[i:i+3])
        language_text=' '.join(language_lines)
        language_aliases=[('English',r'english|\beng\b'),('Indonesian',r'indonesia|bahasa'),('Malay',r'melayu|malay'),('Mandarin',r'mandarin'),('Cantonese',r'cantonese'),('Tamil',r'tamil'),('Hindi',r'hindi'),('Burmese',r'burmese|myanmar'),('Arabic',r'arabic'),('Hokkien',r'hokkien'),('Tagalog',r'tagalog')]
        languages=[name for name,pattern in language_aliases if re.search(pattern,language_text,re.I)]
        if languages:put('languages',languages,record,language_text)
        # Explicit experience summaries outside standard tables.
        explicit=[]
        for care,label in [('Infant',r'infant|newborn|baby'),('Child',r'child(?:ren)?'),('Elderly',r'elderly'),('Disability',r'disab(?:led|ility)')]:
            for line in lines:
                if re.search(r'\b(?:'+label+r')[ -]?(?:care)?\s*(?:experience)?\s*:\s*(?:yes|experienced|\d+\s*years?)\b',line,re.I) and 'willing' not in line.lower():explicit.append(care)
        if explicit:put('care',explicit,record,', '.join(explicit)+' experience stated')
        cuisine_lines=[l for l in lines if re.search(r'cooking|cuisines?|nasi goreng|sayur bening|indian food|chinese food',l,re.I)]
        cuisine_text=' '.join(cuisine_lines)
        cuisines=[name for name in ['Indian','Chinese','Indonesian','Western'] if re.search(r'\b'+name+r'\b',cuisine_text,re.I)]
        if re.search(r'nasi goreng|sayur bening|orek tempe',cuisine_text,re.I) and 'Indonesian' not in cuisines:cuisines.append('Indonesian')
        if cuisines:put('cooking',cuisines,record,cuisine_text)
    if 'dob' in fields:
        birth=dt.date.fromisoformat(fields['dob']);today=dt.date.today();age=today.year-birth.year-((today.month,today.day)<(birth.month,birth.day))
        if 'age' not in fields:fields['age']=age;evidence['age']={**evidence['dob'],'text':'Calculated from DOB '+fields['dob']}
        elif abs(fields['age']-age)>1:warnings.append('Printed age differs from date of birth. Verify both fields.')
    if 'jobs' in fields:
        jobs=fields['jobs'];intervals=sorted((j['from'],j['to']) for j in jobs);merged=[]
        for start,end in intervals:
            if merged and start<=merged[-1][1]:merged[-1][1]=max(end,merged[-1][1])
            else:merged.append([start,end])
        if 'years' not in fields:
            fields['years']=sum(end-start for start,end in merged);evidence['years']={**evidence['jobs'],'text':'Approximate years from dated job history; year-only dates have limited precision.'}
        if any(j['singapore'] for j in jobs) or all(j['country']!='Not stated' for j in jobs):
            fields['workLocation']='ex-sg' if any(j['singapore'] for j in jobs) else 'ex-non-sg';evidence['workLocation']=evidence['jobs']
        derived=[kind for kind,test in [('Infant',lambda j:any(a<=2 for a in j.get('kid_ages',[]))),('Child',lambda j:j.get('child_care')),('Elderly',lambda j:j.get('elderly'))] if any(test(j) for j in jobs)]
        if derived:fields['care']=sorted(set(fields.get('care',[])+derived));evidence['care']=evidence['jobs']
    if fields.get('careEvidence'):
        positive=[k for k,v in fields['careEvidence'].items() if v is True]
        if positive:fields['care']=sorted(set(fields.get('care',[])+positive));evidence.setdefault('care',evidence['careEvidence'])
    if 'care' in fields:
        known=fields.setdefault('careEvidence',{})
        for k in fields['care']:known[k]=True
        evidence.setdefault('careEvidence',evidence['care'])
    if 'children' in fields and 'childrenCount' not in fields:
        fields['childrenCount']=len(fields['children']);evidence['childrenCount']=evidence['children']
    if fields.get('childrenCount')==0:fields['children']=[];evidence['children']=evidence['childrenCount']
    if 'children' in fields and fields.get('childrenCount')!=len(fields['children']):warnings.append('Children count and listed ages disagree.')
    if conflicts:warnings.append('Some PDF text and OCR values disagree. Check the highlighted alternatives against the original.')
    core=['name','dob','nationality','marital','education','height_cm','weight_kg','siblings','childrenCount','english','salary','restDays']
    missing=[k for k in core if k not in fields]
    summary=[]
    if fields.get('nationality'):summary.append(fields['nationality'])
    if fields.get('years') is not None:summary.append(f"{fields['years']:g} years of listed employment")
    if fields.get('care'):summary.append('Care: '+', '.join(fields['care']))
    if summary:fields['summary']=' · '.join(summary)+'.';evidence['summary']={'page':None,'method':'Derived','text':'Summary of extracted fields; not an independent assessment.'}
    return {'fields':fields,'name':fields.get('name'),'evidence':evidence,'pages':pages,'warnings':warnings,'conflicts':conflicts,'missing':missing,'ocrAvailable':ocr_available,'scanned':all(len(p['text'])<150 for p in pages),'notice':'Automatically populated from PDF text and available OCR. Verify extracted values against the original before marking the profile reviewed.'}

if __name__=='__main__':
    try: print(json.dumps(extract_pdf(sys.argv[1]),ensure_ascii=False))
    except Exception as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
