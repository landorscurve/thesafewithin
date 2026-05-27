import { useState, useRef, useEffect, useCallback } from 'react'

// ─── API endpoint ─────────────────────────────────────────────────────────────
const API_URL = 'https://www.thesafewithin.com/api/chat'

// ═══════════════════════════════════════════════════════════════════════════════
// STATE ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const STATES = {
  REFLECTION:    'reflection',
  CLARIFICATION: 'clarification',
  SOMATIC:       'somatic',
  ADVICE:        'advice',
  PATTERN:       'pattern',
  TACTICAL:      'tactical',
  REFORMATIVE:   'reformative',
  VOICE_NOTE:    'voice_note',
}

const SIGNALS = {
  somatic: {
    words: ['panic',"can't breathe",'heart racing','shaking','frozen','flooding','spinning','chest tight','heart pounding',"can't think",'falling apart','losing it','breaking down','spiraling','dissociating','going crazy','everything at once','suffocating','paralyzed'],
    capsThreshold: 0.4, fragmentThreshold: 3,
  },
  clarification: {
    words: ['toxic','manipulative','gaslighting','controlling','narcissistic','abusive','narcissist','manipulator','emotional abuse','coercive','high conflict','high-conflict','borderline','personality disorder','love bombing','love-bombing','devaluing','discarding','smear campaign','flying monkeys','word salad','future faking','hoovering','trauma bond','trauma bonding','cognitive dissonance','projection','coercive control','reactive abuse','narcissistic rage','narcissistic supply','ghosting','fauxpology','energy vampire','idealization phase'],
  },
  tactical: {
    phrases: ['what do i say','what should i say','how do i respond','what can i say',"i don't know how to respond","i dont know how to respond",'they said','he said','she said','they keep saying','they accused','he accused','she accused',"they're blaming","he's blaming","she's blaming",'confronted me','argument with','fight with','how do i handle when','what do i do when','they threatened','they texted','they emailed','grey rock','gray rock','biff','stonewalling','canned response','what to say','flying monkeys','smear campaign','word salad','keeps accusing','circles back','nothing i say','they contacted','hoovered','sent a message'],
  },
  advice: {
    phrases: ['what should i do','how do i fix','how can i fix',"i don't know what to do","i dont know what to do","i'm stuck",'im stuck','how can i change','what can i do','tell me what to do','give me advice','what do i do','how do i deal','how do i handle','help me figure out','i need help','i need a plan','how do i get out','how do i leave','i want to leave','thinking about leaving','planning to leave','exit strategy'],
  },
  reformative: {
    phrases: ['i tried','i used','i responded','i stayed calm',"i didn't react",'i walked away','i left','i hung up',"i didn't engage",'it worked','it helped','i feel lighter','i used grey rock',"i didn't jade",'i held the boundary','i dropped the rope','i recognized the pattern','i saw it coming','i anticipated'],
  },
}

const PATTERN_THRESHOLD = 3

const THEME_WORDS = ['anger','angry','rage','shame','guilt','fear','anxiety','grief','loss','lonely','alone','isolated','rejected','abandoned','betrayed','worthless','overwhelmed','numb','relationship','partner','marriage','divorce','custody','separation','conflict','argument','fight','confrontation','accusation','blame','control','controlling','trapped','escape','eggshells','dependent','manipulation','manipulated','coercion','powerless','love bombing','devalue','discard','cycle','pattern','hoovering','triangulation','smear','gaslighting','projection','failure','failed','broken','trust','distrust','self-doubt','confused','leaving','staying','freedom','safety','danger','children','kids']

const HEAVY_WORDS = ['abuse','trauma','suicide','self-harm','die','death','ruin','destroyed','worthless','hopeless','violence','threatened','hurt me']
const EMOTIONAL_WORDS = ['cry','scared','angry','grief','depressed','panic','shame','guilt','devastated','overwhelmed','heartbroken','failed','ruined','trapped','numb','exhausted','drained','humiliated','gaslit','manipulated','controlled','walking on eggshells']

function extractThemes(text) {
  const lower = text.toLowerCase()
  return THEME_WORDS.filter(t => lower.includes(t))
}

function classifyState(text, history, repeatedThemes) {
  const lower = text.toLowerCase()
  const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const avgWords = sentences.length ? sentences.reduce((a, s) => a + s.trim().split(/\s+/).length, 0) / sentences.length : text.split(/\s+/).length
  if (SIGNALS.somatic.words.some(w => lower.includes(w)) || (capsRatio >= 0.4 && text.length > 10) || (avgWords <= 3 && sentences.length >= 2)) {
    return STATES.SOMATIC
  }
  if (SIGNALS.tactical.phrases.find(p => lower.includes(p))) return STATES.TACTICAL
  const refPhrase = SIGNALS.reformative.phrases.find(p => lower.includes(p))
  if (refPhrase && history.length >= 2) return STATES.REFORMATIVE
  if (SIGNALS.clarification.words.find(w => lower.includes(w))) return STATES.CLARIFICATION
  if (SIGNALS.advice.phrases.find(p => lower.includes(p))) return STATES.ADVICE
  if ([...new Set(repeatedThemes)].length >= PATTERN_THRESHOLD) return STATES.PATTERN
  return STATES.REFLECTION
}

function classifyWeight(text, state) {
  if (state === STATES.SOMATIC) return 'heavy'
  if (state === STATES.TACTICAL) return 'emotional'
  const lower = text.toLowerCase()
  if (HEAVY_WORDS.some(w => lower.includes(w))) return 'heavy'
  if (EMOTIONAL_WORDS.some(w => lower.includes(w))) return 'emotional'
  return 'simple'
}

function getDelay(weight) {
  if (weight === 'heavy') return 3000 + Math.random() * 1500
  if (weight === 'emotional') return 1800 + Math.random() * 1200
  return 800 + Math.random() * 400
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

const BASE = `GLOBAL RULES (always apply):
- Ask one question at a time. Never two.
- Avoid over-validating. Avoid therapy clichés.
- Avoid "I'm sorry you're going through this."
- Keep responses SHORT — 1 to 3 sentences maximum.
- Preferred acknowledgments: "That makes sense." / "That stands out." / "That seems important." / "That sounds significant."
- Never use: "I understand." / "I'm sorry." / "That must be so hard." / "I'm here for you."`

const TACTICAL_KB = `HIGH-CONFLICT COMMUNICATION FRAMEWORKS:
GREY ROCK: Become unremarkable. No emotional reaction. Responses: "Okay." / "That's possible." / "I hear you." / "Noted."
BIFF (Brief Informative Friendly Firm): Written exchanges. One paragraph. Facts only. Neutral. Ends conversation. No JADE.
JADE AVOIDANCE: Never Justify, Argue, Defend, or Explain. "I've already decided." = complete response.
BROKEN RECORD: Repeat position calmly, no new info. "I've already decided." over and over.
INFORMATION DIET: Answer only what was asked. Extra info = ammunition.
TACTICAL EXIT: "I'm not continuing this right now." / "I'll follow up in writing." / "I'm stepping away."
DEFLECTION: "Everyone's entitled to their opinion." / "That's possible." / "I see it differently." / "Okay."
BOUNDARY: "I've already decided." / "That doesn't work for me." / "I'm not going to respond to that."
ACCUSATIONS: "That's not how I see it." / "You may feel that way." / "I'm not going to argue about the past."
CIRCULAR/WORD SALAD: "I think we've covered this." / "This conversation isn't productive for me." / "I'm going to stop here."
FUTURE FAKING: "I'll watch for that." / "Actions over time will show that."
SMEAR/FLYING MONKEYS: "I'm not going to respond to secondhand messages." / "Say it directly to me."`

const REFORMATIVE_KB = `REFRAMING PRINCIPLES:
- Managing their emotions is not your job.
- Every strong reaction you show is fuel. You choose what you give.
- It takes two for a tug of war. You can drop the rope.
- Being grey rock is protection, not defeat.
- Explaining yourself implies you need their approval. You don't.
- Their story about you is not yours to correct.
- The apology that doesn't come — or comes as "I'm sorry you feel that way" — is not an apology.
- Future promises are worth exactly what past promises were worth. The pattern is the data.
- Physical safety comes first. Everything else is secondary.
- You are not the story being told about you.
- Strength is rebuilt through small decisions, not a single dramatic choice.`

const PROMPTS = {
  [STATES.REFLECTION]: `You are a calm reflective intelligence in REFLECTION mode.\n${BASE}\nCalm open exploration. One question at a time. Minimal assumptions.\nExamples: "What about the reaction surprised you?" / "That sounds significant. What makes you feel that?" / "That's fine. What else stands out?"`,
  [STATES.CLARIFICATION]: `You are a calm reflective intelligence in CLARIFICATION mode.\n${BASE}\nUser used a heavy term (gaslighting, narcissistic, love bombing, trauma bond, flying monkeys, etc). Move from label to observable behavior.\nBehavior first. Specific event second. Meaning last.\nExamples: "What does that look like in practice?" / "Walk me through a specific moment." / "What did they actually say or do?"`,
  [STATES.SOMATIC]: `You are a calm reflective intelligence in SOMATIC mode.\n${BASE}\nUser is flooding. Slow down. Do not interpret. Focus on present moment.\nOne grounding question only. Very short. Do NOT sound like a meditation app.\nExamples: "What's happening physically right now?" / "Any tension anywhere?" / "Let's slow that down."`,
  [STATES.ADVICE]: `You are a calm reflective intelligence in ADVICE mode.\n${BASE}\nUser wants guidance. Offer 1-2 small practical suggestions. Optional language. No lecturing.\nIf physical safety may be involved, name it once without alarm.\nExamples: "One thing that sometimes helps is noticing the moment before the reaction starts." / "If physical safety is a concern, a domestic violence hotline can help with planning — even if you're not sure yet."`,
  [STATES.PATTERN]: `You are a calm reflective intelligence in PATTERN RECOGNITION mode.\n${BASE}\nEnough context has accumulated. Gently name a recurring pattern. Observational language only. Name the behavior sequence, not the identity.\nExamples: "This pattern seems to return when conflict appears." / "The escalation appears to begin quite quickly." / "There seems to be a recurring sequence worth noticing."`,
  [STATES.TACTICAL]: `You are a calm reflective intelligence in TACTICAL LANGUAGE mode.\n${BASE}\n${TACTICAL_KB}\nUser needs practical language for a high-conflict exchange. Identify the situation type. Select 1-3 canned responses or framework guidance that fit. Briefly name the technique. Follow with one grounded question.\nDO NOT dump the entire library. Select only what fits.\nTone: calm, practical, matter-of-fact.`,
  [STATES.REFORMATIVE]: `You are a calm reflective intelligence in REFORMATIVE mode.\n${BASE}\n${REFORMATIVE_KB}\nUser just used a tactic, reflected on an interaction, or wants a perspective shift. One quiet observational reframe. Name what they did or noticed with neutral respect. One small shift in perspective if it fits. Then one grounded question.\nTone: gently practical. The reframe should feel like something they almost already knew.`,
  [STATES.VOICE_NOTE]: `You are a calm reflective intelligence receiving a long transcribed voice note.\n${BASE}\nThis is stream-of-consciousness — repetition, tangents, half-finished thoughts are normal.\nYOUR ROLE: Do NOT address everything. Find the single most emotionally alive thread. Acknowledge briefly in one phrase. Ask ONE focused question about that specific thread. 2-3 sentences total.\nDo NOT say "I noticed several themes." Do NOT summarize everything back.`,
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Lato:wght@300;400&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; background: #0d1518; -webkit-font-smoothing: antialiased; }
textarea { color-scheme: dark; }
textarea::placeholder { color: rgba(178,204,214,0.3); }
@keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
@keyframes fadeUp  { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
@keyframes pulse   { 0%,100% { transform:scale(0.85); opacity:0.3; box-shadow:0 0 0 0 rgba(178,204,214,0.3); } 50% { transform:scale(1.1); opacity:0.9; box-shadow:0 0 0 14px rgba(178,204,214,0); } }
@keyframes breathe { 0%,100% { transform:translate(-50%,-50%) scale(1); opacity:0.5; } 50% { transform:translate(-50%,-50%) scale(1.2); opacity:0.9; } }
@keyframes msgIn   { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
@keyframes reveal  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@keyframes orbPulse { 0%,100% { box-shadow:0 0 0 0 rgba(178,204,214,0.4); transform:scale(0.92); } 60% { box-shadow:0 0 0 12px rgba(178,204,214,0); transform:scale(1); } }
@keyframes overlayIn { from { opacity:0; } to { opacity:1; } }
@keyframes overlayUp { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
`

const C = {
  text:      '#e0eef2',
  textMid:   'rgba(178,204,214,0.75)',
  textDim:   'rgba(178,204,214,0.45)',
  textFaint: 'rgba(178,204,214,0.28)',
  border:    'rgba(178,204,214,0.15)',
  borderMid: 'rgba(178,204,214,0.28)',
  bg:        '#0d1518',
  orb:       'rgba(178,204,214,0.55)',
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function Orbs() {
  return (
    <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, overflow:'hidden' }}>
      <div style={{ position:'absolute', top:'50%', left:'50%', width:'600px', height:'600px', borderRadius:'50%', background:'radial-gradient(ellipse at center, rgba(178,204,214,0.1) 0%, rgba(168,197,189,0.05) 45%, transparent 70%)', animation:'breathe 10s ease-in-out infinite' }} />
      <div style={{ position:'absolute', top:'25%', left:'15%', width:'300px', height:'300px', borderRadius:'50%', background:'radial-gradient(ellipse at center, rgba(197,221,214,0.06) 0%, transparent 70%)', animation:'breathe 14s ease-in-out infinite reverse' }} />
    </div>
  )
}

function NavBtn({ onClick, children, style={} }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ background:'transparent', border:'none', cursor:'pointer', fontFamily:"'Lato', sans-serif", fontSize:'12px', fontWeight:300, letterSpacing:'0.08em', textTransform:'uppercase', padding:'8px', color: h ? C.text : C.textMid, transition:'color 0.3s', ...style }}>
      {children}
    </button>
  )
}

function Pulse() {
  return (
    <div style={{ padding:'18px 0 8px', animation:'fadeIn 0.6s ease both' }}>
      <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:C.orb, animation:'pulse 3.8s ease-in-out infinite' }} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE NOTE MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function VoiceModal({ onSubmit, onClose }) {
  const [text, setText] = useState('')
  const wc = text.trim() ? text.trim().split(/\s+/).length : 0
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(10,17,20,0.93)', backdropFilter:'blur(8px)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px', overflowY:'auto', animation:'overlayIn 0.4s ease both' }}>
      <div style={{ maxWidth:'540px', width:'100%', animation:'overlayUp 0.4s ease both 0.05s' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'12px' }}>
          <span style={{ fontFamily:"'Lato', sans-serif", fontSize:'11px', color:C.textFaint, letterSpacing:'0.14em', textTransform:'uppercase' }}>Voice note</span>
          <NavBtn onClick={onClose}>Cancel</NavBtn>
        </div>
        <p style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:'18px', color:C.textMid, lineHeight:1.7, marginBottom:'8px' }}>Paste your transcribed voice note here.</p>
        <p style={{ fontFamily:"'Lato', sans-serif", fontSize:'12px', color:C.textDim, lineHeight:1.6, marginBottom:'20px' }}>It will be read in full. A brief summary will be saved. The conversation begins from what matters most.</p>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Paste here..." rows={14} autoFocus
          style={{ width:'100%', background:'rgba(178,204,214,0.03)', border:`1px solid ${C.border}`, borderRadius:'3px', outline:'none', resize:'vertical', fontFamily:"'Lato', sans-serif", fontSize:'14px', color:C.text, lineHeight:1.75, caretColor:C.orb, padding:'16px 18px' }}
          onFocus={e=>e.target.style.borderColor=C.borderMid} onBlur={e=>e.target.style.borderColor=C.border} />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'14px' }}>
          <span style={{ fontFamily:'monospace', fontSize:'10px', color: wc>0?C.textFaint:'transparent' }}>{wc.toLocaleString()} words</span>
          <button onClick={()=>{ if(text.trim()) onSubmit(text) }} disabled={!text.trim()}
            style={{ background:text.trim()?'rgba(178,204,214,0.1)':'transparent', border:`1px solid ${text.trim()?C.borderMid:C.border}`, color:text.trim()?C.text:C.textFaint, fontFamily:"'Lato', sans-serif", fontSize:'12px', letterSpacing:'0.12em', textTransform:'uppercase', padding:'12px 28px', borderRadius:'2px', cursor:text.trim()?'pointer':'default', transition:'all 0.3s' }}>
            Send note
          </button>
        </div>
        <p style={{ fontFamily:"'Lato', sans-serif", fontSize:'10px', color:'rgba(178,204,214,0.15)', marginTop:'14px', textAlign:'center' }}>The full transcript is not stored. Only a brief summary is saved.</p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════════════════════════════

const STARTER_PROMPTS = [
  'Something affected me today',
  'I reacted in a way that surprised me',
  'I feel emotionally overwhelmed',
  "I can't stop thinking about something",
  "I'm struggling with someone in my life",
  'I feel disconnected lately',
  "I don't understand my behavior lately",
  "I'm trying to figure out if I should leave",
  'I had an exchange that left me feeling confused',
  'I want to reflect openly',
]

function LandingScreen({ onBegin, onPrivacy, onPrinciples }) {
  const [h, setH] = useState(false)
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100dvh', padding:'40px 24px', animation:'fadeIn 1.2s ease both' }}>
      <div style={{ maxWidth:'400px', width:'100%', textAlign:'center', animation:'fadeUp 1.4s ease both' }}>
        <img src="/Logo.svg" alt="The Safe Within" style={{ width:'260px', margin:'0 auto 32px', display:'block', opacity:0.95 }} />
        <h1 style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:'clamp(26px,5vw,36px)', fontWeight:400, color:C.text, letterSpacing:'-0.02em', lineHeight:1.3, margin:'0 0 18px' }}>
          Your thoughts.<br/>Your patterns.<br/>Your control.
        </h1>
        <p style={{ fontFamily:"'Lato', sans-serif", fontSize:'15px', fontWeight:300, color:C.textMid, lineHeight:1.7, margin:'0 0 6px' }}>Built for honest reflection, privacy, and personal growth.</p>
        <p style={{ fontFamily:"'Lato', sans-serif", fontSize:'13px', fontWeight:300, color:C.textMid, lineHeight:1.65, margin:'0 0 6px' }}>A private space for personal growth through reflection.</p>
        <p style={{ fontFamily:"'Lato', sans-serif", fontSize:'11px', fontWeight:300, color:C.textDim, letterSpacing:'0.1em', textTransform:'uppercase', margin:'0 0 40px' }}>You control what is remembered</p>
        <button onClick={onBegin} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
          style={{ background:h?'rgba(178,204,214,0.18)':'rgba(178,204,214,0.1)', border:`1px solid ${h?'rgba(178,204,214,0.45)':'rgba(178,204,214,0.3)'}`, color:C.text, fontFamily:"'Lato', sans-serif", fontSize:'13px', fontWeight:400, letterSpacing:'0.14em', textTransform:'uppercase', padding:'16px 40px', borderRadius:'2px', cursor:'pointer', transition:'all 0.4s', width:'100%', marginBottom:'12px' }}>
          Begin
        </button>
        <div style={{ display:'flex', justifyContent:'center', gap:'4px', flexWrap:'wrap' }}>
          <NavBtn onClick={onPrivacy}>How privacy works</NavBtn>
          <span style={{ color:C.border, lineHeight:'36px', fontSize:'11px' }}>·</span>
          <NavBtn onClick={onPrinciples}>Why this exists</NavBtn>
        </div>
      </div>
    </div>
  )
}

function MemoryScreen({ onContinue }) {
  const [selected, setSelected] = useState(null)
  const [skipped, setSkipped] = useState(false)
  const opts = [
    { id:'temp',  label:'Temporary Session',    desc:'Nothing is saved after you leave.' },
    { id:'local', label:'Save on this device',  desc:'Stored privately in your browser. Never transmitted.' },
  ]
  if (skipped) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100dvh', padding:'40px 24px', animation:'fadeIn 0.8s ease both' }}>
      <div style={{ maxWidth:'360px', textAlign:'center' }}>
        <p style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:'20px', color:C.textMid, lineHeight:1.75, margin:'0 0 12px' }}>This session will not retain memory after you leave.</p>
        <p style={{ fontFamily:"'Lato', sans-serif", fontSize:'13px', fontWeight:300, color:C.textDim, lineHeight:1.8, margin:'0 0 40px' }}>A new session will begin the next time you return.</p>
        <button onClick={()=>onContinue('temp')} style={{ background:'transparent', border:`1px solid ${C.border}`, color:C.textDim, fontFamily:"'Lato', sans-serif", fontSize:'12px', letterSpacing:'0.1em', textTransform:'uppercase', padding:'12px 32px', borderRadius:'2px', cursor:'pointer', transition:'all 0.3s' }}>Continue</button>
      </div>
    </div>
  )
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100dvh', padding:'40px 24px', animation:'fadeUp 0.9s ease both' }}>
      <div style={{ maxWidth:'400px', width:'100%' }}>
        <p style={{ fontFamily:"'Lato', sans-serif", fontSize:'11px', color:C.textFaint, letterSpacing:'0.14em', textTransform:'uppercase', margin:'0 0 28px', textAlign:'center' }}>Memory handling</p>
        <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'28px' }}>
          {opts.map((o,i) => (
            <div key={o.id} onClick={()=>setSelected(o.id)}
              style={{ padding:'18px 20px', borderRadius:'3px', border:`1px solid ${selected===o.id?C.borderMid:C.border}`, background:selected===o.id?'rgba(178,204,214,0.06)':'transparent', cursor:'pointer', transition:'all 0.3s', animation:`reveal 0.5s ease both ${i*0.1+0.1}s` }}
              onMouseEnter={e=>{ if(selected!==o.id) e.currentTarget.style.borderColor=C.borderMid }}
              onMouseLeave={e=>{ if(selected!==o.id) e.currentTarget.style.borderColor=C.border }}>
              <div style={{ fontFamily:"'Lato', sans-serif", fontSize:'14px', fontWeight:400, color:selected===o.id?C.text:C.textMid, marginBottom:'4px', transition:'color 0.3s' }}>{o.label}</div>
              <div style={{ fontFamily:"'Lato', sans-serif", fontSize:'12px', fontWeight:300, color:C.textDim, lineHeight:1.5 }}>{o.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {selected && <button onClick={()=>onContinue(selected)} style={{ background:'rgba(178,204,214,0.09)', border:`1px solid ${C.borderMid}`, color:C.text, fontFamily:"'Lato', sans-serif", fontSize:'13px', letterSpacing:'0.1em', textTransform:'uppercase', padding:'14px', borderRadius:'2px', cursor:'pointer', transition:'all 0.3s', animation:'fadeIn 0.3s ease both' }}>Continue</button>}
          <NavBtn onClick={()=>setSkipped(true)} style={{ textAlign:'center' }}>Skip for now</NavBtn>
        </div>
      </div>
    </div>
  )
}

function PrivacyScreen({ onBack }) {
  const items = [
    ['We do not sell your data.', 'Your reflections are yours alone. They are never sold, shared, or monetized.'],
    ['We do not use your reflections for advertising.', 'Nothing you write here is used to profile or target you in any way.'],
    ['You decide what is remembered.', 'Memory is opt-in. By default, sessions are temporary and leave no trace.'],
    ['No account required.', 'No registration. No identity necessary.'],
    ['Your data stays on your device.', 'When you choose to save, everything stays in your browser only.'],
  ]
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100dvh', padding:'48px 24px', animation:'fadeUp 0.7s ease both' }}>
      <div style={{ maxWidth:'400px', width:'100%' }}>
        <p style={{ fontFamily:"'Lato', sans-serif", fontSize:'11px', color:C.textFaint, letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:'8px' }}>Privacy</p>
        <h2 style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:'22px', fontWeight:400, color:C.textMid, lineHeight:1.4, margin:'0 0 32px' }}>What we believe about your information.</h2>
        {items.map(([t,b],i) => (
          <div key={i} style={{ marginBottom:'24px', animation:`reveal 0.5s ease both ${i*0.08+0.1}s` }}>
            <div style={{ fontFamily:"'Lato', sans-serif", fontSize:'13px', fontWeight:400, color:C.textMid, marginBottom:'4px' }}>{t}</div>
            <div style={{ fontFamily:"'Lato', sans-serif", fontSize:'13px', fontWeight:300, color:C.textDim, lineHeight:1.65 }}>{b}</div>
          </div>
        ))}
        <NavBtn onClick={onBack} style={{ paddingLeft:0, marginTop:'8px' }}>← Back</NavBtn>
      </div>
    </div>
  )
}

function PrinciplesScreen({ onBack }) {
  const items = [
    ['Why this exists.', 'This platform is built for personal growth through reflection. A space to slow down, notice patterns, and ask better questions of yourself.'],
    ['This is not therapy.', 'It is not diagnosis. It is not a replacement for professional support. If you are in crisis or need clinical help, please seek it.'],
    ['The premise is simple.', 'Many people already carry answers inside them. The right question, asked at the right time, can make those answers easier to see.'],
    ['Built around three things.', 'Privacy, self-honesty, and user control. Nothing is assumed about you. Nothing is sold. Nothing is remembered without your permission.'],
  ]
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100dvh', padding:'48px 24px', animation:'fadeUp 0.7s ease both' }}>
      <div style={{ maxWidth:'400px', width:'100%' }}>
        <p style={{ fontFamily:"'Lato', sans-serif", fontSize:'11px', color:C.textFaint, letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:'8px' }}>Principles</p>
        <h2 style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:'22px', fontWeight:400, color:C.textMid, lineHeight:1.4, margin:'0 0 32px' }}>Why this exists.</h2>
        {items.map(([t,b],i) => (
          <div key={i} style={{ marginBottom:'26px', animation:`reveal 0.5s ease both ${i*0.08+0.1}s` }}>
            <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:'16px', fontWeight:400, color:C.textMid, marginBottom:'6px' }}>{t}</div>
            <div style={{ fontFamily:"'Lato', sans-serif", fontSize:'13px', fontWeight:300, color:C.textDim, lineHeight:1.75 }}>{b}</div>
          </div>
        ))}
        <NavBtn onClick={onBack} style={{ paddingLeft:0, marginTop:'8px' }}>← Back</NavBtn>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// REFLECTION SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

function ReflectionScreen() {
  const [messages, setMessages]         = useState([])
  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [showPrompts, setShowPrompts]   = useState(false)
  const [showVoice, setShowVoice]       = useState(false)
  const [started, setStarted]           = useState(false)
  const [repeatedThemes, setRepeatedThemes] = useState([])
  const [error, setError]               = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, loading])

  const callAPI = useCallback(async (msgs, system) => {
    const res = await fetch(API_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ messages:msgs, max_tokens:1000, system }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
    const text = data.content?.find(b=>b.type==='text')?.text
    if (!text) throw new Error('No response received')
    return text
  }, [])

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return
    setError(null)
    setShowPrompts(false)
    setStarted(true)

    const newThemes = extractThemes(text)
    const allThemes = [...repeatedThemes, ...newThemes]
    setRepeatedThemes(allThemes)

    const state  = classifyState(text, messages, allThemes)
    const weight = classifyWeight(text, state)
    const delay  = getDelay(weight)
    const system = PROMPTS[state] || PROMPTS[STATES.REFLECTION]

    const userMsg = { role:'user', content:text }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    setLoading(true)

    try {
      const [reply] = await Promise.all([
        callAPI(newMsgs, system),
        new Promise(r => setTimeout(r, delay)),
      ])
      setMessages(prev => [...prev, { role:'assistant', content:reply }])
    } catch(err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [loading, messages, repeatedThemes, callAPI])

  const handleVoiceSubmit = useCallback(async (transcript) => {
    setShowVoice(false)
    setStarted(true)
    setError(null)

    const newThemes = extractThemes(transcript)
    const allThemes = [...repeatedThemes, ...newThemes]
    setRepeatedThemes(allThemes)

    const prefixed = `[Voice note transcript — stream of consciousness]\n\n${transcript}`
    const apiMsgs = [...messages, { role:'user', content:prefixed }]

    setMessages(prev => [...prev, { role:'user', content:transcript, _voice:true }])
    setLoading(true)

    try {
      const [reply] = await Promise.all([
        callAPI(apiMsgs, PROMPTS[STATES.VOICE_NOTE]),
        new Promise(r => setTimeout(r, 2400)),
      ])
      setMessages(prev => [...prev, { role:'assistant', content:reply }])
    } catch(err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [loading, messages, repeatedThemes, callAPI])

  const handleKey = (e) => {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  return (
    <>
      {showVoice && <VoiceModal onSubmit={handleVoiceSubmit} onClose={()=>setShowVoice(false)} />}

      <div style={{ display:'flex', flexDirection:'column', height:'100dvh', maxWidth:'580px', margin:'0 auto', padding:'0 20px' }}>

        {/* Header */}
        <div style={{ paddingTop:'24px', paddingBottom:'16px', animation:'fadeUp 0.8s ease both' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
            <div style={{ width:'22px', height:'22px', borderRadius:'50%', background:'radial-gradient(circle, rgba(178,204,214,0.55) 0%, rgba(168,197,189,0.2) 100%)', animation:'orbPulse 5s ease-in-out infinite', flexShrink:0 }} />
            <NavBtn style={{ fontSize:'11px', padding:'4px 0' }} onClick={()=>{}}>Journal</NavBtn>
          </div>
          {!started && (
            <>
              <h2 style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:'clamp(20px,4vw,26px)', fontWeight:400, color:C.text, margin:'0 0 6px', letterSpacing:'-0.01em' }}>How would you like to begin?</h2>
              <p style={{ fontFamily:"'Lato', sans-serif", fontSize:'13px', fontWeight:300, color:C.textDim }}>Use your own words to start.</p>
            </>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:'auto', paddingBottom:'12px' }}>
          {messages.map((m,i) => (
            <div key={i} style={{ marginBottom:'24px', animation:'msgIn 0.5s ease both' }}>
              {m.role==='user' ? (
                <div style={{ fontFamily:"'Lato', sans-serif", fontSize:'15px', fontWeight:400, color:'rgba(224,238,242,0.82)', lineHeight:1.72, paddingLeft:'16px', borderLeft:`1px solid ${m._voice?'rgba(184,168,197,0.35)':'rgba(178,204,214,0.25)'}` }}>
                  {m._voice && <span style={{ display:'block', fontFamily:"'Lato', sans-serif", fontSize:'10px', letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(184,168,197,0.45)', marginBottom:'6px' }}>Voice note</span>}
                  {m.content}
                </div>
              ) : (
                <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:'17px', fontWeight:400, color:'rgba(178,204,214,0.88)', lineHeight:1.82, fontStyle:'italic' }}>
                  {m.content}
                </div>
              )}
            </div>
          ))}
          {loading && <Pulse />}
          {error && <div style={{ color:'rgba(200,120,120,0.8)', fontSize:'13px', padding:'8px 12px', background:'rgba(200,100,100,0.08)', borderRadius:'4px', marginBottom:'16px' }}>⚠ {error}</div>}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ paddingBottom:'28px', animation:'fadeUp 1s ease both' }}>
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:'14px' }}>
            <div style={{ position:'relative' }}>
              <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
                placeholder={started?'Continue...':'Begin here...'} rows={3} disabled={loading}
                style={{ width:'100%', background:'transparent', border:'none', outline:'none', resize:'none', fontFamily:"'Lato', sans-serif", fontSize:'15px', fontWeight:300, color:C.text, lineHeight:1.72, caretColor:C.orb, padding:'0 40px 0 0' }} />
              {input.trim() && !loading && (
                <button onClick={()=>sendMessage(input)}
                  style={{ position:'absolute', right:0, bottom:0, background:'transparent', border:`1px solid ${C.borderMid}`, color:C.textMid, borderRadius:'50%', width:'32px', height:'32px', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.25s', animation:'fadeIn 0.25s ease both' }}>↑</button>
              )}
            </div>

            {!started && (
              <div style={{ marginTop:'14px' }}>
                <div style={{ display:'flex', gap:'12px', alignItems:'center', flexWrap:'wrap' }}>
                  <NavBtn onClick={()=>setShowPrompts(p=>!p)} style={{ paddingLeft:0, color:C.textDim }}>
                    {showPrompts?'Close':'I\'m not sure where to start'}
                  </NavBtn>
                  <span style={{ color:C.border, fontSize:'11px' }}>·</span>
                  <NavBtn onClick={()=>{ setShowPrompts(false); setShowVoice(true) }} style={{ paddingLeft:0, color:C.textDim }}>
                    Paste a voice note
                  </NavBtn>
                </div>

                {showPrompts && (
                  <div style={{ marginTop:'12px', display:'flex', flexDirection:'column', gap:'6px' }}>
                    {STARTER_PROMPTS.map((p,i) => (
                      <button key={i} onClick={()=>{ setInput(p); setShowPrompts(false) }}
                        style={{ background:'rgba(178,204,214,0.04)', border:`1px solid ${C.border}`, color:C.textMid, fontFamily:"'Lato', sans-serif", fontSize:'13px', fontWeight:300, padding:'11px 16px', borderRadius:'2px', textAlign:'left', cursor:'pointer', transition:'all 0.25s', animation:`reveal 0.35s ease both ${i*0.05}s` }}
                        onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.borderMid; e.currentTarget.style.background='rgba(178,204,214,0.08)'; e.currentTarget.style.color=C.text }}
                        onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.background='rgba(178,204,214,0.04)'; e.currentTarget.style.color=C.textMid }}>
                        {p}
                      </button>
                    ))}
                    <p style={{ fontFamily:"'Lato', sans-serif", fontSize:'11px', fontWeight:300, color:C.textFaint, marginTop:'4px', lineHeight:1.6, animation:`reveal 0.35s ease both ${STARTER_PROMPTS.length*0.05+0.05}s` }}>
                      If none of these fit, edit the text above or write your own.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [screen, setScreen] = useState('landing')

  return (
    <div style={{ minHeight:'100dvh', background:C.bg, color:C.text, position:'relative' }}>
      <style>{GLOBAL_CSS}</style>
      <Orbs />
      <div style={{ position:'relative', zIndex:1 }}>
        {screen==='landing'    && <LandingScreen    onBegin={()=>setScreen('memory')} onPrivacy={()=>setScreen('privacy')} onPrinciples={()=>setScreen('principles')} />}
        {screen==='memory'     && <MemoryScreen     onContinue={()=>setScreen('reflect')} />}
        {screen==='privacy'    && <PrivacyScreen    onBack={()=>setScreen('landing')} />}
        {screen==='principles' && <PrinciplesScreen onBack={()=>setScreen('landing')} />}
        {screen==='reflect'    && <ReflectionScreen />}
      </div>
    </div>
  )
}
