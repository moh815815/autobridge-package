// ═══════════════════════════════════════════════════════════════════
// AutoBridge — Supabase Connected Version
// Replace YOUR_SUPABASE_URL and YOUR_SUPABASE_ANON_KEY below
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

// ─── CONFIG — ضع بياناتك هنا ───────────────────────────────────────
const SUPABASE_URL  = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON = "YOUR_ANON_KEY_HERE";

// ─── SUPABASE CLIENT (بدون مكتبة — fetch مباشر) ──────────────────
const sb = {
  headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json" },
  // ─ Auth ─
  async signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method:"POST", headers:{"apikey":SUPABASE_ANON,"Content-Type":"application/json"},
      body:JSON.stringify({email,password})
    });
    return r.json();
  },
  async signUp(email, password, full_name) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method:"POST", headers:{"apikey":SUPABASE_ANON,"Content-Type":"application/json"},
      body:JSON.stringify({email,password,data:{full_name}})
    });
    return r.json();
  },
  async signOut(token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method:"POST", headers:{...this.headers,"Authorization":`Bearer ${token}`}
    });
  },
  async getUser(token) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers:{...this.headers,"Authorization":`Bearer ${token}`}
    });
    return r.json();
  },
  // ─ DB ─
  authHeaders(token) {
    return { ...this.headers, "Authorization": `Bearer ${token}` };
  },
  async select(table, query="*", token, filter="") {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${query}${filter ? "&"+filter : ""}`, {
      headers: this.authHeaders(token)
    });
    return r.json();
  },
  async insert(table, data, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method:"POST", headers:{...this.authHeaders(token),"Prefer":"return=representation"},
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async update(table, id, data, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method:"PATCH", headers:{...this.authHeaders(token),"Prefer":"return=representation"},
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async del(table, id, token) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method:"DELETE", headers: this.authHeaders(token)
    });
  },
  async rpc(fn, params, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method:"POST", headers: this.authHeaders(token), body: JSON.stringify(params)
    });
    return r.json();
  },
  // ─ Realtime (polling fallback) ─
  async subscribeToNotifications(userId, token, onNew) {
    const poll = async () => {
      try {
        const data = await this.select("notifications","*",token,
          `user_id=eq.${userId}&read=eq.false&order=created_at.desc&limit=10`);
        if(Array.isArray(data)) onNew(data);
      } catch(e) {}
    };
    poll();
    return setInterval(poll, 15000);
  },
  // ─ Execute a flow step (real HTTP call) ─
  async executeStep(step, variables={}, token) {
    const resolveVars = (str) => {
      if(!str) return str;
      return str.replace(/\{\{([^}]+)\}\}/g, (_,k) => variables[k.trim()] || `{{${k}}}`);
    };
    const url    = resolveVars(step.url) + resolveVars(step.path);
    const body   = resolveVars(step.body);
    const authH  = step.auth_type === "Bearer" ? {"Authorization":`Bearer ${resolveVars(step.auth_value)||""}`}
                 : step.auth_type === "ApiKey"  ? {"X-API-Key": resolveVars(step.auth_value)||""}
                 : {};
    const headers = { "Content-Type":"application/json", ...authH, ...(step.headers||{}) };
    const t0 = Date.now();
    try {
      const r = await fetch(url, {
        method: step.method,
        headers,
        body: ["GET","HEAD"].includes(step.method) ? undefined : body
      });
      const latency = Date.now()-t0;
      const txt = await r.text();
      return { ok: r.ok, status: r.status, latency, body: txt.slice(0,2000) };
    } catch(e) {
      return { ok: false, status: 0, latency: Date.now()-t0, body: e.message, error: e.message };
    }
  }
};

// ─── TOAST ────────────────────────────────────────────────────────
const ToastCtx = createContext(null);
function ToastProvider({children}) {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type="success") => {
    const id = Date.now();
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)), 3500);
  },[]);
  const C = {success:"#10b981",error:"#ef4444",info:"#0ea5e9",warning:"#f59e0b"};
  const I = {success:"✓",error:"✕",info:"ℹ",warning:"⚠"};
  return (
    <ToastCtx.Provider value={add}>
      {children}
      <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:"0.45rem",maxWidth:320,direction:"rtl"}}>
        {toasts.map(t=>(
          <div key={t.id} style={{background:"#0f172a",border:`1px solid ${C[t.type]}50`,borderRight:`3px solid ${C[t.type]}`,borderRadius:"0.65rem",padding:"0.8rem 1rem",display:"flex",alignItems:"center",gap:"0.65rem",boxShadow:"0 8px 24px rgba(0,0,0,0.4)",animation:"toastIn 0.25s ease",cursor:"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontSize:"0.875rem"}} onClick={()=>setToasts(ts=>ts.filter(x=>x.id!==t.id))}>
            <div style={{width:26,height:26,background:`${C[t.type]}20`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:C[t.type],fontWeight:700,flexShrink:0,fontSize:"0.78rem"}}>{I[t.type]}</div>
            <span style={{color:"#f1f5f9",flex:1}}>{t.msg}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </ToastCtx.Provider>
  );
}
const useToast = () => useContext(ToastCtx);

// ─── AUTH CONTEXT ─────────────────────────────────────────────────
const AuthCtx = createContext(null);
function AuthProvider({children}) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    const s = localStorage.getItem("ab_session");
    if(s) {
      const parsed = JSON.parse(s);
      setSession(parsed);
      loadProfile(parsed.access_token, parsed.user.id);
    } else setLoading(false);
  },[]);

  const loadProfile = async (token, uid) => {
    try {
      const data = await sb.select("profiles","*,companies(*)",token,`id=eq.${uid}`);
      if(Array.isArray(data) && data[0]) setProfile(data[0]);
    } catch(e) {}
    setLoading(false);
  };

  const signIn = async (email, password) => {
    const data = await sb.signIn(email, password);
    if(data.access_token) {
      localStorage.setItem("ab_session", JSON.stringify(data));
      setSession(data);
      await loadProfile(data.access_token, data.user.id);
      return {ok:true};
    }
    return {ok:false, error: data.error_description || "بيانات غير صحيحة"};
  };

  const signUp = async (email, password, name) => {
    const data = await sb.signUp(email, password, name);
    if(data.access_token) {
      localStorage.setItem("ab_session", JSON.stringify(data));
      setSession(data);
      await loadProfile(data.access_token, data.user.id);
      return {ok:true};
    }
    return {ok:false, error: data.error_description || "خطأ في التسجيل"};
  };

  const signOut = async () => {
    if(session) await sb.signOut(session.access_token);
    localStorage.removeItem("ab_session");
    setSession(null); setProfile(null);
  };

  return (
    <AuthCtx.Provider value={{session, profile, loading, signIn, signUp, signOut, reload:()=>loadProfile(session?.access_token, session?.user?.id)}}>
      {children}
    </AuthCtx.Provider>
  );
}
const useAuth = () => useContext(AuthCtx);
const useToken = () => useContext(AuthCtx)?.session?.access_token;

// ─── HOOKS ────────────────────────────────────────────────────────
function useSupabase(table, query="*", filter="", deps=[]) {
  const token = useToken();
  const [data, setData]   = useState([]);
  const [loading, setLoad] = useState(true);
  const [error, setErr]   = useState(null);

  const fetch_ = useCallback(async () => {
    if(!token) return;
    setLoad(true);
    try {
      const d = await sb.select(table, query, token, filter);
      if(Array.isArray(d)) setData(d);
      else setErr(d?.message || "خطأ");
    } catch(e) { setErr(e.message); }
    setLoad(false);
  },[token, table, query, filter]);

  useEffect(()=>{ fetch_(); },[fetch_,...deps]);
  return {data, loading, error, refetch:fetch_};
}

// ─── UTILS ────────────────────────────────────────────────────────
const sleep  = ms => new Promise(r=>setTimeout(r,ms));
const fmtNum = n => n>=1000 ? (n/1000).toFixed(1)+"k" : String(n||0);
const METHOD_COLOR = {GET:"#10b981",POST:"#0ea5e9",PUT:"#f59e0b",PATCH:"#f97316",DELETE:"#ef4444"};
const ar = (lang) => lang==="ar";

// ─── LOGIN PAGE ───────────────────────────────────────────────────
function LoginPage({lang, setLang}) {
  const {signIn, signUp} = useAuth();
  const toast = useToast();
  const [mode, setMode]   = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass]   = useState("");
  const [name, setName]   = useState("");
  const [busy, setBusy]   = useState(false);
  const isAr = ar(lang);

  const submit = async () => {
    if(!email||!pass){toast("أدخل البريد وكلمة المرور","warning");return;}
    setBusy(true);
    const res = mode==="login" ? await signIn(email,pass) : await signUp(email,pass,name);
    setBusy(false);
    if(!res.ok) toast(res.error||"خطأ","error");
    else toast(mode==="login"?"مرحباً بعودتك! ✓":"تم إنشاء حسابك ✓","success");
  };

  const inp = (val,set,ph,type="text") => (
    <input value={val} onChange={e=>set(e.target.value)} type={type} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&submit()}
      style={{width:"100%",background:"#0f172a",border:"1px solid #1e293b",borderRadius:"0.6rem",padding:"0.75rem 1rem",color:"#f1f5f9",fontFamily:"inherit",fontSize:"0.88rem",boxSizing:"border-box",outline:"none"}}
      onFocus={e=>e.target.style.borderColor="#0ea5e9"} onBlur={e=>e.target.style.borderColor="#1e293b"}/>
  );

  return (
    <div style={{minHeight:"100vh",background:"#020817",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'IBM Plex Sans Arabic',sans-serif",direction:isAr?"rtl":"ltr",padding:"1rem",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:"-15%",right:"-5%",width:"500px",height:"500px",background:"radial-gradient(circle,#0ea5e918,transparent 65%)",borderRadius:"50%",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:"-15%",left:"-5%",width:"450px",height:"450px",background:"radial-gradient(circle,#8b5cf612,transparent 65%)",borderRadius:"50%",pointerEvents:"none"}}/>
      <button onClick={()=>setLang(l=>l==="ar"?"en":"ar")} style={{position:"absolute",top:20,left:20,background:"#1e293b",border:"1px solid #334155",borderRadius:"0.4rem",padding:"0.35rem 0.75rem",color:"#94a3b8",cursor:"pointer",fontFamily:"inherit",fontSize:"0.78rem",fontWeight:700}}>
        {lang==="ar"?"EN":"ع"}
      </button>
      <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"1.5rem",padding:"2.5rem 2rem",width:"100%",maxWidth:420,boxShadow:"0 25px 80px rgba(0,0,0,0.5)"}}>
        <div style={{textAlign:"center",marginBottom:"2rem"}}>
          <div style={{width:52,height:52,background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)",borderRadius:"1rem",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem",margin:"0 auto 0.75rem"}}>⚡</div>
          <div style={{fontSize:"1.5rem",fontWeight:700,background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>AutoBridge</div>
          <div style={{color:"#475569",fontSize:"0.82rem",marginTop:"0.25rem"}}>{mode==="login"?(isAr?"مرحباً بعودتك":"Welcome back"):(isAr?"أنشئ حسابك":"Create account")}</div>
        </div>
        {/* Tabs */}
        <div style={{display:"flex",background:"#0f172a",borderRadius:"0.6rem",padding:"0.2rem",marginBottom:"1.5rem"}}>
          {[["login",isAr?"دخول":"Sign In"],["register",isAr?"تسجيل":"Sign Up"]].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:"0.5rem",background:mode===m?"#1e293b":"transparent",border:"none",borderRadius:"0.45rem",color:mode===m?"#f1f5f9":"#64748b",cursor:"pointer",fontFamily:"inherit",fontSize:"0.82rem",fontWeight:mode===m?600:400,transition:"all 0.18s"}}>{l}</button>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"0.75rem",marginBottom:"1.25rem"}}>
          {mode==="register"&&inp(name,setName,isAr?"الاسم الكامل":"Full name")}
          {inp(email,setEmail,isAr?"البريد الإلكتروني":"Email","email")}
          {inp(pass,setPass,isAr?"كلمة المرور":"Password","password")}
        </div>
        <button onClick={submit} disabled={busy} style={{width:"100%",padding:"0.85rem",background:busy?"#1e293b":"linear-gradient(135deg,#0ea5e9,#8b5cf6)",border:"none",borderRadius:"0.7rem",color:"#fff",cursor:busy?"not-allowed":"pointer",fontFamily:"inherit",fontSize:"0.9rem",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:"0.5rem"}}>
          {busy&&<span style={{width:14,height:14,border:"2px solid #fff",borderTopColor:"transparent",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite"}}/>}
          {busy?(isAr?"جاري...":"Loading..."):(mode==="login"?(isAr?"دخول ←":"Sign In →"):(isAr?"إنشاء الحساب":"Create Account"))}
        </button>
        <div style={{textAlign:"center",marginTop:"1.25rem",color:"#334155",fontSize:"0.78rem"}}>
          {isAr?"أو":"Or"} <button onClick={()=>toast("جاري إضافة دعم Google...","info")} style={{background:"none",border:"none",color:"#0ea5e9",cursor:"pointer",fontFamily:"inherit",fontSize:"0.78rem"}}>
            {isAr?"الدخول بـ Google":"Continue with Google"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────
function Dashboard({lang}) {
  const token = useToken();
  const {profile} = useAuth();
  const toast = useToast();
  const isAr = ar(lang);
  const {data:flows, loading:flowsLoading} = useSupabase("flows","id,title,icon,color,status,runs_count,last_run_at,sector","order=created_at.desc&limit=8");
  const {data:runs,  loading:runsLoading}  = useSupabase("flow_runs","id,status,duration_ms,started_at","order=started_at.desc&limit=100");
  const {data:notifs}= useSupabase("notifications","*","read=eq.false&order=created_at.desc&limit=5");

  const totalRuns   = runs.length;
  const successRuns = runs.filter(r=>r.status==="success").length;
  const failRuns    = runs.filter(r=>r.status==="error").length;
  const successRate = totalRuns>0 ? Math.round(successRuns/totalRuns*100) : 0;
  const avgLatency  = runs.length>0 ? Math.round(runs.reduce((a,r)=>a+(r.duration_ms||0),0)/runs.length) : 0;

  const BAR_HOURS = Array.from({length:12},(_,i)=>{
    const h = runs.filter(r=>new Date(r.started_at).getHours()===i*2).length;
    return {h:i*2, v:h};
  });
  const maxV = Math.max(1,...BAR_HOURS.map(b=>b.v));

  if(flowsLoading) return <SkeletonDash/>;

  return (
    <section style={{padding:"2rem 1.5rem",maxWidth:1300,margin:"0 auto",fontFamily:"'IBM Plex Sans Arabic',sans-serif",direction:isAr?"rtl":"ltr"}}>
      {/* Welcome */}
      <div style={{marginBottom:"1.5rem"}}>
        <h2 style={{fontSize:"1.3rem",fontWeight:700}}>
          {isAr?"مرحباً":"Hello"}, {profile?.full_name?.split(" ")[0]||"—"} 👋
        </h2>
        <p style={{color:"#475569",fontSize:"0.82rem",marginTop:"0.2rem"}}>{isAr?"إليك ملخص نشاط تدفقاتك اليوم":"Here's your flow activity summary"}</p>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"0.7rem",marginBottom:"1.5rem"}}>
        {[
          {v:flows.length,          l:isAr?"تدفقات نشطة":"Active Flows",   c:"#0ea5e9", i:"🔄"},
          {v:totalRuns,             l:isAr?"تنفيذ الكلي":"Total Runs",     c:"#8b5cf6", i:"▶"},
          {v:`${successRate}%`,     l:isAr?"نسبة النجاح":"Success Rate",   c:"#10b981", i:"✓"},
          {v:`${avgLatency}ms`,     l:isAr?"متوسط الوقت":"Avg Latency",    c:"#f59e0b", i:"⚡"},
          {v:failRuns,              l:isAr?"طلبات فاشلة":"Failed",         c:"#ef4444", i:"✕"},
          {v:notifs.length,         l:isAr?"إشعارات جديدة":"New Alerts",   c:"#ec4899", i:"🔔"},
        ].map(m=>(
          <div key={m.l} style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"0.85rem",padding:"1rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.4rem"}}>
              <span style={{fontSize:"1.1rem"}}>{m.i}</span>
            </div>
            <div style={{fontSize:"1.5rem",fontWeight:700,color:m.c,fontVariantNumeric:"tabular-nums"}}>{m.v}</div>
            <div style={{color:"#475569",fontSize:"0.75rem",marginTop:"0.15rem"}}>{m.l}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:"1rem",marginBottom:"1.25rem"}}>
        {/* Bar chart */}
        <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"1rem",padding:"1.4rem"}}>
          <div style={{fontWeight:600,marginBottom:"1.1rem",fontSize:"0.9rem"}}>📈 {isAr?"تنفيذ آخر 24 ساعة":"Last 24h Executions"}</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:"0.35rem",height:90}}>
            {BAR_HOURS.map((b,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"0.3rem"}}>
                <div style={{width:"100%",background:`linear-gradient(180deg,#0ea5e9,#0ea5e940)`,borderRadius:"2px 2px 0 0",height:`${(b.v/maxV)*100}%`,minHeight:4,transition:"height 0.5s"}}/>
                <span style={{fontSize:"0.6rem",color:"#334155"}}>{b.h}:00</span>
              </div>
            ))}
          </div>
        </div>
        {/* Status donut */}
        <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"1rem",padding:"1.4rem"}}>
          <div style={{fontWeight:600,marginBottom:"1rem",fontSize:"0.9rem"}}>{isAr?"حالة التدفقات":"Flow Status"}</div>
          {[
            [flows.filter(f=>f.status==="active").length,    isAr?"نشط":"Active",   "#10b981"],
            [flows.filter(f=>f.status==="paused").length,    isAr?"موقوف":"Paused",  "#f59e0b"],
            [flows.filter(f=>f.status==="error").length,     isAr?"خطأ":"Error",     "#ef4444"],
            [flows.filter(f=>f.status==="draft").length,     isAr?"مسودة":"Draft",   "#64748b"],
          ].map(([v,l,c])=>(
            <div key={l} style={{marginBottom:"0.7rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.78rem",marginBottom:"0.25rem"}}>
                <span style={{color:"#94a3b8"}}>{l}</span><span style={{color:c,fontWeight:700}}>{v}</span>
              </div>
              <div style={{background:"#1e293b",borderRadius:"2rem",height:4,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:"2rem",background:c,width:`${flows.length>0?Math.round(v/flows.length*100):0}%`,transition:"width 0.4s"}}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent flows */}
      <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"1rem",padding:"1.4rem"}}>
        <div style={{fontWeight:600,marginBottom:"1rem",fontSize:"0.9rem"}}>🔄 {isAr?"التدفقات الأخيرة":"Recent Flows"}</div>
        {flows.length===0 ? (
          <div style={{textAlign:"center",padding:"3rem",color:"#334155",fontSize:"0.875rem"}}>
            📭 {isAr?"لا تدفقات بعد — أنشئ أول تدفق":"No flows yet — create your first flow"}
          </div>
        ) : (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.8rem",minWidth:500}}>
              <thead>
                <tr>{[isAr?"التدفق":"Flow",isAr?"القطاع":"Sector",isAr?"الحالة":"Status",isAr?"تشغيل":"Runs",isAr?"آخر تشغيل":"Last Run"].map(h=>(
                  <th key={h} style={{padding:"0.55rem 0.75rem",textAlign:"right",color:"#334155",borderBottom:"1px solid #1e293b",fontWeight:500}}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {flows.map(f=>{
                  const sc = f.status==="active"?"#10b981":f.status==="paused"?"#f59e0b":f.status==="error"?"#ef4444":"#64748b";
                  return(
                    <tr key={f.id} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#0f172a"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"0.65rem 0.75rem",borderBottom:"1px solid #0a0f1e"}}>
                        <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                          <span>{f.icon||"⚡"}</span><span style={{fontWeight:600}}>{f.title}</span>
                        </div>
                      </td>
                      <td style={{padding:"0.65rem 0.75rem",color:"#64748b",borderBottom:"1px solid #0a0f1e"}}>{f.sector||"—"}</td>
                      <td style={{padding:"0.65rem 0.75rem",borderBottom:"1px solid #0a0f1e"}}>
                        <span style={{background:`${sc}18`,color:sc,border:`1px solid ${sc}30`,borderRadius:"0.25rem",padding:"0.15rem 0.5rem",fontSize:"0.72rem",fontWeight:600}}>{f.status}</span>
                      </td>
                      <td style={{padding:"0.65rem 0.75rem",color:"#0ea5e9",fontWeight:700,borderBottom:"1px solid #0a0f1e"}}>{fmtNum(f.runs_count)}</td>
                      <td style={{padding:"0.65rem 0.75rem",color:"#475569",fontSize:"0.78rem",borderBottom:"1px solid #0a0f1e"}}>
                        {f.last_run_at ? new Date(f.last_run_at).toLocaleString("ar-EG",{hour:"2-digit",minute:"2-digit"}) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── FLOW BUILDER (REAL EXECUTION) ───────────────────────────────
function RealFlowBuilder({lang}) {
  const token = useToken();
  const toast = useToast();
  const isAr  = ar(lang);
  const {data:flows, loading, refetch} = useSupabase("flows","*,flow_steps(*)","order=created_at.desc");
  const [selected, setSelected] = useState(null);
  const [running,  setRunning]  = useState(false);
  const [logs,     setLogs]     = useState([]);
  const [stepResults, setStepRes] = useState({});
  const logRef = useRef();

  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight; },[logs]);

  const addLog = (msg, type="info") => {
    const t = new Date().toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    setLogs(l=>[...l,{msg,type,t,id:Date.now()+Math.random()}]);
  };

  const runFlow = async () => {
    if(!selected) return;
    const steps = (selected.flow_steps||[]).sort((a,b)=>a.step_order-b.step_order);
    if(!steps.length){toast(isAr?"لا خطوات في هذا التدفق":"No steps in this flow","warning");return;}

    setRunning(true); setLogs([]); setStepRes({});
    // Create run record
    const [run] = await sb.insert("flow_runs",{
      flow_id: selected.id,
      trigger_type: "manual",
      status: "running",
      steps_total: steps.length,
      steps_done: 0,
    }, token) || [null];

    addLog(`🚀 ${isAr?"بدء تنفيذ":"Starting"}: ${selected.title}`,"start");
    let allOk = true;
    const variables = { now: { date: new Date().toISOString().split("T")[0], month: new Date().getMonth()+1, year: new Date().getFullYear() } };

    for(let i=0; i<steps.length; i++){
      const step = steps[i];
      addLog(`▶ [${i+1}/${steps.length}] ${step.name}`,"step");
      addLog(`   ${step.method} ${step.url}${step.path}`,"code");

      const result = await sb.executeStep(step, variables, token);
      setStepRes(r=>({...r,[step.id]:result}));

      // Log to DB
      if(run?.id) await sb.insert("step_logs",{
        run_id:     run.id,
        step_id:    step.id,
        step_order: step.step_order,
        step_name:  step.name,
        status:     result.ok?"success":"error",
        request_url: step.url+step.path,
        request_method: step.method,
        response_status: result.status,
        response_body:   result.body?.slice(0,500),
        latency_ms:  result.latency,
      }, token);

      if(result.ok) {
        addLog(`   ✓ ${result.status} OK — ${result.latency}ms`,"success");
        try { Object.assign(variables, JSON.parse(result.body||"{}")); } catch(e){}
      } else {
        addLog(`   ✗ ${result.status||"Network Error"} — ${result.error||result.body?.slice(0,80)}`,"error");
        allOk = false;
        if(step.retry_count>0){
          addLog(`   ↩ ${isAr?"إعادة المحاولة":"Retrying"}...`,"warning");
          await sleep(800);
          const r2 = await sb.executeStep(step,variables,token);
          if(r2.ok){ addLog(`   ✓ ${isAr?"نجح بعد إعادة المحاولة":"Succeeded on retry"} — ${r2.latency}ms`,"success"); allOk=true; }
        }
      }

      // Update run progress
      if(run?.id) await sb.update("flow_runs", run.id, {steps_done: i+1}, token);
    }

    // Finalize run
    if(run?.id) await sb.update("flow_runs", run.id, {
      status:      allOk?"success":"error",
      finished_at: new Date().toISOString(),
    }, token);

    // Increment counter
    await sb.rpc("increment_flow_runs",{flow_id:selected.id}, token);

    addLog(allOk?`🎉 ${isAr?"اكتمل بنجاح":"Completed successfully"}`:`⚠️ ${isAr?"اكتمل مع أخطاء":"Completed with errors"}`, allOk?"done":"error");
    setRunning(false);
    if(allOk) toast(isAr?"✓ اكتمل التدفق بنجاح":"Flow completed ✓","success");
    else toast(isAr?"التدفق اكتمل مع أخطاء":"Flow completed with errors","warning");
    refetch();

    // Send notification
    await sb.insert("notifications",{
      user_id: token ? (await sb.getUser(token)).id : null,
      type:    allOk?"success":"error",
      title:   `${allOk?"✓":"✗"} ${selected.title}`,
      body:    allOk?(isAr?"اكتمل التدفق بنجاح":"Flow completed"):(isAr?"اكتمل مع أخطاء":"Completed with errors"),
      flow_id: selected.id,
    }, token);
  };

  const createFlow = async () => {
    const title = prompt(isAr?"اسم التدفق الجديد:":"New flow name:");
    if(!title) return;
    const [f] = await sb.insert("flows",{title, icon:"⚡", color:"#0ea5e9", status:"draft"}, token)||[];
    if(f) { toast(isAr?"تم إنشاء التدفق ✓":"Flow created ✓","success"); refetch(); setSelected(f); }
    else toast(isAr?"خطأ في الإنشاء":"Create failed","error");
  };

  if(loading) return <div style={{padding:"3rem",textAlign:"center",color:"#475569",fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}><div style={{width:20,height:20,border:"2px solid #0ea5e9",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite",margin:"0 auto 1rem"}}/>جاري التحميل...</div>;

  return (
    <section style={{padding:"2rem 1.5rem",maxWidth:1300,margin:"0 auto",fontFamily:"'IBM Plex Sans Arabic',sans-serif",direction:isAr?"rtl":"ltr"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem",flexWrap:"wrap",gap:"0.75rem"}}>
        <div>
          <h2 style={{fontSize:"1.3rem",fontWeight:700}}>⚡ {isAr?"منفذ التدفقات":"Flow Executor"}</h2>
          <p style={{color:"#475569",fontSize:"0.8rem"}}>{isAr?"اختر تدفقاً وشغّله — الطلبات حقيقية":"Select a flow and run it — requests are real"}</p>
        </div>
        <button onClick={createFlow} style={{background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)",border:"none",borderRadius:"0.6rem",padding:"0.55rem 1.2rem",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:"0.85rem",fontWeight:700}}>
          + {isAr?"تدفق جديد":"New Flow"}
        </button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:"1rem"}}>
        {/* Flow list */}
        <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"0.9rem",padding:"0.85rem",overflowY:"auto",maxHeight:520}}>
          <div style={{fontSize:"0.72rem",color:"#334155",marginBottom:"0.65rem",textTransform:"uppercase",letterSpacing:"0.07em"}}>{isAr?"تدفقاتك":"Your Flows"} ({flows.length})</div>
          {flows.length===0?(
            <div style={{textAlign:"center",padding:"2rem",color:"#334155",fontSize:"0.82rem"}}>📭 {isAr?"لا تدفقات":"No flows"}</div>
          ) : flows.map(f=>(
            <div key={f.id} onClick={()=>{setSelected(f);setLogs([]);setStepRes({});}} style={{padding:"0.75rem",borderRadius:"0.6rem",background:selected?.id===f.id?`${f.color||"#0ea5e9"}15`:"transparent",border:`1px solid ${selected?.id===f.id?(f.color||"#0ea5e9")+"60":"transparent"}`,cursor:"pointer",marginBottom:"0.3rem",transition:"all 0.18s"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                <span style={{fontSize:"1.1rem"}}>{f.icon||"⚡"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:"0.85rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.title}</div>
                  <div style={{fontSize:"0.7rem",color:"#475569"}}>{fmtNum(f.runs_count)} {isAr?"تشغيل":"runs"}</div>
                </div>
                <div style={{width:7,height:7,borderRadius:"50%",background:f.status==="active"?"#10b981":f.status==="error"?"#ef4444":"#64748b",flexShrink:0}}/>
              </div>
            </div>
          ))}
        </div>

        {/* Run panel */}
        <div>
          {!selected ? (
            <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"0.9rem",padding:"4rem",textAlign:"center",color:"#334155",height:520,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"0.75rem"}}>
              <span style={{fontSize:"3rem",opacity:0.3}}>⚡</span>
              <div style={{fontSize:"0.875rem"}}>{isAr?"اختر تدفقاً من القائمة":"Select a flow from the list"}</div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
              {/* Steps */}
              <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"0.9rem",padding:"1.25rem"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
                  <div style={{fontWeight:700,display:"flex",alignItems:"center",gap:"0.5rem"}}>
                    <span>{selected.icon}</span>{selected.title}
                    <span style={{fontSize:"0.72rem",color:"#475569",fontWeight:400}}>({(selected.flow_steps||[]).length} {isAr?"خطوات":"steps"})</span>
                  </div>
                  <button onClick={runFlow} disabled={running} style={{background:running?"#1e293b":`linear-gradient(135deg,${selected.color||"#0ea5e9"},${selected.color||"#0ea5e9"}aa)`,border:"none",borderRadius:"0.55rem",padding:"0.55rem 1.3rem",color:"#fff",cursor:running?"not-allowed":"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.875rem",display:"flex",alignItems:"center",gap:"0.4rem"}}>
                    {running&&<span style={{width:12,height:12,border:"2px solid #fff",borderTopColor:"transparent",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite"}}/>}
                    {running?(isAr?"جارٍ...":"Running..."):(isAr?"▶ تشغيل":"▶ Run")}
                  </button>
                </div>
                {(selected.flow_steps||[]).sort((a,b)=>a.step_order-b.step_order).map((step,i)=>{
                  const res = stepResults[step.id];
                  const borderC = res?.ok?"#10b981":res?"#ef4444":"#1e293b";
                  return(
                    <div key={step.id} style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:res?.ok?"#10b981":res?"#ef4444":"#1e293b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.62rem",color:"#fff",fontWeight:700,flexShrink:0}}>
                        {res?.ok?"✓":res?"✕":i+1}
                      </div>
                      <div style={{flex:1,background:"#0f172a",border:`1px solid ${borderC}`,borderRadius:"0.5rem",padding:"0.55rem 0.8rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <span style={{fontSize:"0.85rem",fontWeight:600}}>{step.icon} {step.name}</span>
                          <div style={{fontSize:"0.68rem",fontFamily:"'Fira Code',monospace",color:METHOD_COLOR[step.method]||"#64748b",direction:"ltr",textAlign:"left"}}>{step.method} {step.path}</div>
                        </div>
                        {res&&<span style={{fontSize:"0.72rem",color:res.ok?"#10b981":"#ef4444",fontFamily:"'Fira Code',monospace"}}>{res.status} · {res.latency}ms</span>}
                      </div>
                    </div>
                  );
                })}
                {(selected.flow_steps||[]).length===0&&(
                  <div style={{textAlign:"center",padding:"1.5rem",color:"#334155",fontSize:"0.82rem"}}>
                    {isAr?"لا خطوات — أضف خطوات من Supabase Dashboard":"No steps — add via Supabase Dashboard"}
                  </div>
                )}
              </div>

              {/* Live log */}
              <div ref={logRef} style={{background:"#020817",border:"1px solid #1e293b",borderRadius:"0.75rem",padding:"0.9rem",height:180,overflowY:"auto",fontFamily:"'Fira Code',monospace",fontSize:"0.73rem",lineHeight:1.75}}>
                {logs.length===0?<span style={{color:"#1e293b"}}>// {isAr?"اضغط تشغيل...":"Press run..."}</span>:logs.map(l=>(
                  <div key={l.id} style={{color:l.type==="success"?"#10b981":l.type==="error"?"#ef4444":l.type==="done"?"#f59e0b":l.type==="start"||l.type==="step"?"#0ea5e9":l.type==="code"?"#334155":"#64748b"}}>
                    <span style={{color:"#1e3a5f"}}>[{l.t}] </span>{l.msg}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────
function Notifications({lang}) {
  const token = useToken();
  const toast = useToast();
  const isAr  = ar(lang);
  const {data:notifs, loading, refetch} = useSupabase("notifications","*","order=created_at.desc&limit=50");

  const markRead  = async (id) => { await sb.update("notifications",id,{read:true},token); refetch(); };
  const markAll   = async ()    => { for(const n of notifs.filter(x=>!x.read)) await sb.update("notifications",n.id,{read:true},token); refetch(); toast(isAr?"تم تحديد الكل كمقروء":"All marked read","success"); };
  const deleteN   = async (id)  => { await sb.del("notifications",id,token); refetch(); };

  const C = {success:"#10b981",error:"#ef4444",warning:"#f59e0b",info:"#0ea5e9"};

  if(loading) return <div style={{padding:"3rem",textAlign:"center",color:"#475569",fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}>جاري التحميل...</div>;

  return (
    <section style={{padding:"2rem 1.5rem",maxWidth:860,margin:"0 auto",fontFamily:"'IBM Plex Sans Arabic',sans-serif",direction:isAr?"rtl":"ltr"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem"}}>
        <h2 style={{fontSize:"1.3rem",fontWeight:700}}>
          🔔 {isAr?"الإشعارات":"Notifications"}
          {notifs.filter(n=>!n.read).length>0&&<span style={{marginRight:"0.6rem",background:"#ef4444",color:"#fff",borderRadius:"2rem",padding:"0.1rem 0.5rem",fontSize:"0.7rem",fontWeight:700}}>{notifs.filter(n=>!n.read).length}</span>}
        </h2>
        {notifs.some(n=>!n.read)&&<button onClick={markAll} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:"0.5rem",padding:"0.42rem 0.9rem",color:"#94a3b8",cursor:"pointer",fontFamily:"inherit",fontSize:"0.8rem"}}>✓ {isAr?"تحديد الكل":"Mark all read"}</button>}
      </div>
      {notifs.length===0?(
        <div style={{textAlign:"center",padding:"5rem",color:"#334155",fontSize:"0.875rem"}}>📭 {isAr?"لا إشعارات":"No notifications"}</div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
          {notifs.map(n=>(
            <div key={n.id} onClick={()=>markRead(n.id)} style={{background:n.read?"#0a0f1e":"#0f172a",border:`1px solid ${n.read?"#1e293b":(C[n.type]||"#0ea5e9")+"40"}`,borderRadius:"0.75rem",padding:"1rem",cursor:"pointer",display:"flex",gap:"0.85rem",alignItems:"flex-start",transition:"all 0.18s",position:"relative"}}>
              {!n.read&&<div style={{position:"absolute",top:12,left:12,width:7,height:7,borderRadius:"50%",background:C[n.type]||"#0ea5e9"}}/>}
              <div style={{width:36,height:36,background:`${(C[n.type]||"#0ea5e9")}18`,border:`1px solid ${(C[n.type]||"#0ea5e9")}30`,borderRadius:"0.5rem",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>
                {n.type==="success"?"✅":n.type==="error"?"❌":n.type==="warning"?"⚠️":"ℹ️"}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:n.read?500:700,fontSize:"0.875rem",marginBottom:"0.2rem"}}>{n.title}</div>
                <div style={{color:"#64748b",fontSize:"0.8rem"}}>{n.body}</div>
                <div style={{color:"#334155",fontSize:"0.7rem",marginTop:"0.3rem"}}>{new Date(n.created_at).toLocaleString("ar-EG")}</div>
              </div>
              <button onClick={e=>{e.stopPropagation();deleteN(n.id);}} style={{background:"none",border:"none",color:"#334155",cursor:"pointer",fontSize:"0.78rem",flexShrink:0,padding:"0.2rem 0.3rem"}}>✕</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── ANALYTICS ────────────────────────────────────────────────────
function Analytics({lang}) {
  const token = useToken();
  const {profile} = useAuth();
  const isAr = ar(lang);
  const {data:runs,loading} = useSupabase("flow_runs","*,flows(title,icon)","order=started_at.desc&limit=200");

  const byDay  = {};
  runs.forEach(r=>{
    const d = r.started_at?.split("T")[0]||"";
    if(!byDay[d]) byDay[d] = {total:0,success:0,failed:0};
    byDay[d].total++;
    if(r.status==="success") byDay[d].success++;
    else if(r.status==="error") byDay[d].failed++;
  });
  const days = Object.entries(byDay).sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);
  const maxRuns = Math.max(1,...days.map(([,v])=>v.total));

  if(loading) return <div style={{padding:"3rem",textAlign:"center",color:"#475569",fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}>جاري التحميل...</div>;

  return (
    <section style={{padding:"2rem 1.5rem",maxWidth:1200,margin:"0 auto",fontFamily:"'IBM Plex Sans Arabic',sans-serif",direction:isAr?"rtl":"ltr"}}>
      <h2 style={{fontSize:"1.3rem",fontWeight:700,marginBottom:"1.5rem"}}>📊 {isAr?"التحليلات الحقيقية":"Real Analytics"}</h2>

      {/* KPI row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"0.7rem",marginBottom:"1.5rem"}}>
        {[
          [runs.length, isAr?"إجمالي التنفيذ":"Total Runs", "#0ea5e9"],
          [runs.filter(r=>r.status==="success").length, isAr?"نجح":"Success", "#10b981"],
          [runs.filter(r=>r.status==="error").length, isAr?"فشل":"Failed", "#ef4444"],
          [runs.length>0?Math.round(runs.filter(r=>r.status==="success").length/runs.length*100)+"%":"—", isAr?"نسبة النجاح":"Rate", "#f59e0b"],
          [runs.length>0?Math.round(runs.reduce((a,r)=>a+(r.duration_ms||0),0)/runs.length)+"ms":"—", isAr?"متوسط الوقت":"Avg Time", "#8b5cf6"],
          [Object.keys(byDay).length, isAr?"أيام نشطة":"Active Days", "#06b6d4"],
        ].map(([v,l,c])=>(
          <div key={l} style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"0.85rem",padding:"1rem"}}>
            <div style={{fontSize:"1.4rem",fontWeight:700,color:c,fontVariantNumeric:"tabular-nums"}}>{v}</div>
            <div style={{color:"#475569",fontSize:"0.75rem",marginTop:"0.15rem"}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"1rem",padding:"1.4rem",marginBottom:"1.25rem"}}>
        <div style={{fontWeight:600,marginBottom:"1.25rem",fontSize:"0.9rem"}}>📈 {isAr?"آخر 14 يوم":"Last 14 days"}</div>
        {days.length===0?(
          <div style={{textAlign:"center",padding:"3rem",color:"#334155",fontSize:"0.875rem"}}>
            {isAr?"لا بيانات بعد — شغّل بعض التدفقات":"No data yet — run some flows"}
          </div>
        ):(
          <div style={{display:"flex",alignItems:"flex-end",gap:"0.4rem",height:120}}>
            {days.map(([d,v],i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"0.3rem"}}>
                <div style={{width:"100%",position:"relative",height:`${(v.total/maxRuns)*100}%`,minHeight:4}}>
                  <div style={{position:"absolute",bottom:0,width:"100%",background:"#0ea5e940",borderRadius:"2px",height:"100%"}}/>
                  <div style={{position:"absolute",bottom:0,width:"100%",background:"#10b981",borderRadius:"2px",height:`${v.total>0?v.success/v.total*100:0}%`}}/>
                </div>
                <span style={{fontSize:"0.58rem",color:"#334155",whiteSpace:"nowrap"}}>{d.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{display:"flex",gap:"1rem",marginTop:"0.75rem",fontSize:"0.72rem",color:"#64748b"}}>
          <span><span style={{color:"#0ea5e9"}}>■</span> {isAr?"كلي":"Total"}</span>
          <span><span style={{color:"#10b981"}}>■</span> {isAr?"ناجح":"Success"}</span>
        </div>
      </div>

      {/* Recent runs table */}
      <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"1rem",padding:"1.4rem"}}>
        <div style={{fontWeight:600,marginBottom:"1rem",fontSize:"0.9rem"}}>{isAr?"آخر التنفيذات":"Recent Executions"}</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.78rem",minWidth:480}}>
            <thead>
              <tr>{[isAr?"التدفق":"Flow",isAr?"الحالة":"Status",isAr?"المدة":"Duration",isAr?"الوقت":"Time"].map(h=>(
                <th key={h} style={{padding:"0.5rem 0.75rem",textAlign:"right",color:"#334155",borderBottom:"1px solid #1e293b",fontWeight:500}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {runs.slice(0,15).map(r=>{
                const sc = r.status==="success"?"#10b981":r.status==="error"?"#ef4444":"#f59e0b";
                return(
                  <tr key={r.id}>
                    <td style={{padding:"0.6rem 0.75rem",borderBottom:"1px solid #0a0f1e"}}>
                      {r.flows?.icon||"⚡"} {r.flows?.title||"—"}
                    </td>
                    <td style={{padding:"0.6rem 0.75rem",borderBottom:"1px solid #0a0f1e"}}>
                      <span style={{background:`${sc}18`,color:sc,borderRadius:"0.25rem",padding:"0.15rem 0.5rem",fontSize:"0.72rem",fontWeight:600}}>{r.status}</span>
                    </td>
                    <td style={{padding:"0.6rem 0.75rem",color:"#64748b",fontFamily:"'Fira Code',monospace",borderBottom:"1px solid #0a0f1e"}}>{r.duration_ms?r.duration_ms+"ms":"—"}</td>
                    <td style={{padding:"0.6rem 0.75rem",color:"#475569",borderBottom:"1px solid #0a0f1e"}}>{new Date(r.started_at).toLocaleString("ar-EG",{hour:"2-digit",minute:"2-digit"})}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {runs.length===0&&<div style={{textAlign:"center",padding:"2rem",color:"#334155",fontSize:"0.875rem"}}>📭 {isAr?"لا تنفيذات بعد":"No runs yet"}</div>}
      </div>
    </section>
  );
}

// ─── SKELETON ─────────────────────────────────────────────────────
function SkeletonDash() {
  return (
    <div style={{padding:"2rem 1.5rem",maxWidth:1300,margin:"0 auto",fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}>
      <div style={{marginBottom:"1.5rem"}}>
        <div style={{width:200,height:20,background:"linear-gradient(90deg,#1e293b 25%,#334155 50%,#1e293b 75%)",backgroundSize:"200% 100%",animation:"shimmer 1.4s infinite",borderRadius:"0.4rem",marginBottom:8}}/>
        <div style={{width:140,height:14,background:"linear-gradient(90deg,#1e293b 25%,#334155 50%,#1e293b 75%)",backgroundSize:"200% 100%",animation:"shimmer 1.4s infinite",borderRadius:"0.4rem"}}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"0.7rem",marginBottom:"1.5rem"}}>
        {[1,2,3,4,5,6].map(i=>(
          <div key={i} style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"0.85rem",padding:"1rem",height:85,background:"linear-gradient(90deg,#0a0f1e 25%,#0f172a 50%,#0a0f1e 75%)",backgroundSize:"200% 100%",animation:"shimmer 1.4s infinite"}}/>
        ))}
      </div>
    </div>
  );
}

// ─── PROFILE / SETTINGS ──────────────────────────────────────────
function ProfileSettings({lang}) {
  const {profile, reload} = useAuth();
  const token = useToken();
  const toast = useToast();
  const isAr  = ar(lang);
  const [name, setName]   = useState(profile?.full_name||"");
  const [tz,   setTz]     = useState(profile?.timezone||"Africa/Cairo");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await sb.update("profiles", profile.id, {full_name:name, timezone:tz, updated_at:new Date().toISOString()}, token);
    setSaving(false);
    reload();
    toast(isAr?"✓ تم حفظ الإعدادات":"Settings saved ✓","success");
  };

  return (
    <section style={{padding:"2rem 1.5rem",maxWidth:620,margin:"0 auto",fontFamily:"'IBM Plex Sans Arabic',sans-serif",direction:isAr?"rtl":"ltr"}}>
      <h2 style={{fontSize:"1.3rem",fontWeight:700,marginBottom:"1.5rem"}}>⚙️ {isAr?"إعدادات الحساب":"Account Settings"}</h2>
      <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"1rem",padding:"1.75rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"1.75rem"}}>
          <div style={{width:60,height:60,background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem",fontWeight:700,flexShrink:0}}>
            {(profile?.full_name||"أ")[0]}
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:"1rem"}}>{profile?.full_name||"—"}</div>
            <div style={{color:"#64748b",fontSize:"0.8rem"}}>{profile?.role||"editor"} · {profile?.companies?.name||isAr?"بدون شركة":"No company"}</div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          {[[isAr?"الاسم الكامل":"Full Name",name,setName],[isAr?"المنطقة الزمنية":"Timezone",tz,setTz]].map(([l,v,s],i)=>(
            <div key={l}>
              <div style={{fontSize:"0.75rem",color:"#64748b",marginBottom:"0.35rem"}}>{l}</div>
              {i===1 ? (
                <select value={v} onChange={e=>s(e.target.value)} style={{width:"100%",background:"#020817",border:"1px solid #1e293b",borderRadius:"0.5rem",padding:"0.65rem 0.85rem",color:"#f1f5f9",fontFamily:"inherit",fontSize:"0.875rem"}}>
                  {["Africa/Cairo","Asia/Riyadh","Asia/Dubai","Asia/Kuwait","Asia/Baghdad","Europe/London","America/New_York"].map(t=><option key={t}>{t}</option>)}
                </select>
              ) : (
                <input value={v} onChange={e=>s(e.target.value)} style={{width:"100%",background:"#020817",border:"1px solid #1e293b",borderRadius:"0.5rem",padding:"0.65rem 0.85rem",color:"#f1f5f9",fontFamily:"inherit",fontSize:"0.875rem",boxSizing:"border-box"}}/>
              )}
            </div>
          ))}
        </div>
        <button onClick={save} disabled={saving} style={{marginTop:"1.5rem",width:"100%",padding:"0.8rem",background:saving?"#1e293b":"linear-gradient(135deg,#0ea5e9,#8b5cf6)",border:"none",borderRadius:"0.6rem",color:"#fff",cursor:saving?"not-allowed":"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.875rem",display:"flex",alignItems:"center",justifyContent:"center",gap:"0.5rem"}}>
          {saving&&<span style={{width:14,height:14,border:"2px solid #fff",borderTopColor:"transparent",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite"}}/>}
          {saving?(isAr?"جاري الحفظ...":"Saving..."):(isAr?"حفظ التغييرات":"Save Changes")}
        </button>
      </div>
    </section>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────
function AppInner() {
  const {session, profile, loading, signOut} = useAuth();
  const toast = useToast();
  const [section, setSection] = useState("dashboard");
  const [lang, setLang]       = useState("ar");
  const [theme, setTheme]     = useState("dark");
  const isAr = ar(lang);

  const NAV = [
    {id:"dashboard",   lbl:isAr?"📊 الرئيسية":"📊 Home"},
    {id:"flows",       lbl:isAr?"⚡ التدفقات":"⚡ Flows"},
    {id:"analytics",   lbl:isAr?"📈 التحليلات":"📈 Analytics"},
    {id:"notifications",lbl:isAr?"🔔 الإشعارات":"🔔 Alerts"},
    {id:"settings",    lbl:isAr?"⚙️ الإعدادات":"⚙️ Settings"},
  ];

  if(loading) return (
    <div style={{minHeight:"100vh",background:"#020817",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}>
      <div style={{textAlign:"center",color:"#475569"}}>
        <div style={{width:40,height:40,border:"3px solid #0ea5e9",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 1rem"}}/>
        <div style={{fontSize:"0.875rem"}}>جاري التحميل...</div>
      </div>
    </div>
  );

  if(!session) return <LoginPage lang={lang} setLang={setLang}/>;

  return (
    <div style={{minHeight:"100vh",background:theme==="dark"?"#020817":"#f8fafc",fontFamily:"'IBM Plex Sans Arabic',sans-serif",direction:isAr?"rtl":"ltr",color:theme==="dark"?"#f1f5f9":"#0f172a"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#020817}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes slideIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        nav button:hover{background:#1e293b!important;color:#f1f5f9!important}
      `}</style>

      {/* Navbar */}
      <nav style={{position:"sticky",top:0,zIndex:100,background:"rgba(2,8,23,0.95)",backdropFilter:"blur(20px)",borderBottom:"1px solid #1e293b"}}>
        <div style={{maxWidth:1300,margin:"0 auto",padding:"0 1rem",display:"flex",alignItems:"center",gap:"0.5rem",height:54}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.45rem",flexShrink:0,cursor:"pointer"}} onClick={()=>setSection("dashboard")}>
            <div style={{width:28,height:28,background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)",borderRadius:"0.38rem",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.85rem"}}>⚡</div>
            <span style={{fontWeight:700,fontSize:"0.95rem",background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>AutoBridge</span>
            <span style={{fontSize:"0.55rem",background:"#10b98115",color:"#10b981",border:"1px solid #10b98130",borderRadius:"0.2rem",padding:"0.1rem 0.38rem"}}>LIVE</span>
          </div>
          <div style={{display:"flex",gap:"0.1rem",flex:1,overflowX:"auto",scrollbarWidth:"none"}}>
            {NAV.map(n=>(
              <button key={n.id} onClick={()=>setSection(n.id)} style={{background:section===n.id?"#1e293b":"transparent",border:"none",color:section===n.id?"#f1f5f9":"#64748b",padding:"0.38rem 0.75rem",borderRadius:"0.4rem",cursor:"pointer",fontFamily:"inherit",fontSize:"0.8rem",whiteSpace:"nowrap",flexShrink:0,transition:"all 0.15s"}}>
                {n.lbl}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:"0.35rem",alignItems:"center",flexShrink:0}}>
            <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:"0.38rem",padding:"0.3rem 0.5rem",color:"#94a3b8",cursor:"pointer",fontSize:"0.78rem"}}>{theme==="dark"?"☀️":"🌙"}</button>
            <button onClick={()=>setLang(l=>l==="ar"?"en":"ar")} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:"0.38rem",padding:"0.3rem 0.6rem",color:"#94a3b8",cursor:"pointer",fontFamily:"inherit",fontSize:"0.72rem",fontWeight:700}}>{isAr?"EN":"ع"}</button>
            <div style={{width:28,height:28,background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.72rem",fontWeight:700,cursor:"pointer",flexShrink:0}} onClick={()=>setSection("settings")} title={profile?.full_name}>
              {(profile?.full_name||"أ")[0]}
            </div>
            <button onClick={async()=>{await signOut();toast(isAr?"تم تسجيل الخروج":"Signed out","info");}} style={{background:"#ef444415",border:"1px solid #ef444430",borderRadius:"0.38rem",padding:"0.3rem 0.6rem",color:"#ef4444",cursor:"pointer",fontFamily:"inherit",fontSize:"0.72rem"}}>
              {isAr?"خروج":"Sign Out"}
            </button>
          </div>
        </div>
      </nav>

      <main style={{animation:"slideIn 0.35s ease"}}>
        {section==="dashboard"    && <Dashboard lang={lang}/>}
        {section==="flows"        && <RealFlowBuilder lang={lang}/>}
        {section==="analytics"    && <Analytics lang={lang}/>}
        {section==="notifications"&& <Notifications lang={lang}/>}
        {section==="settings"     && <ProfileSettings lang={lang}/>}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppInner/>
      </ToastProvider>
    </AuthProvider>
  );
}
