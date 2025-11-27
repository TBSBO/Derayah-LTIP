import{s as f}from"./index-DeFA-a9n.js";const Q=["performance","performance_based","hybrid"],B=async(i,r,a,m=100,e)=>{var t,p;try{console.log("🔍 getAllVestingEvents called with:",{companyId:i,statusFilter:r,eventTypeFilter:a,limit:m,grantIds:e});const d=`
      *,
      employees (
        id,
        first_name_en,
        first_name_ar,
        last_name_en,
        last_name_ar
      ),
      grants (
        id,
        grant_number,
        total_shares,
        vested_shares,
        plan_id,
        vesting_schedule_id,
        employee_acceptance_at,
        incentive_plans (
          plan_name_en,
          plan_code,
          plan_type
        ),
        grant_performance_metrics (
          performance_metric_id,
          performance_metrics (
            id,
            name,
            description,
            metric_type,
            unit_of_measure
          )
        )
      )
    `;let n=f.from("vesting_events").select(d).eq("company_id",i);e&&e.length>0&&(n=n.in("grant_id",e),m=1e3,console.log("📌 Filtering by grant IDs:",e,"with increased limit:",m)),console.log("📊 Query built for company_id:",i),r&&r!=="all"&&(n=n.eq("status",r)),a&&a!=="all"&&(n=n.eq("event_type",a));let u=await n.order("vesting_date",{ascending:!0}).limit(m),c=u.data??[],s=u.error,v=!0;if(s&&(s.code==="PGRST301"||(t=s.message)!=null&&t.includes("vesting_schedule_id")||(p=s.message)!=null&&p.includes("column")||s.status===400)){console.warn("⚠️ vesting_schedule_id not available on grants, retrying without it"),v=!1;const _=d.replace(/\s*vesting_schedule_id,\s*/g,"").replace(/\s*vesting_schedule_id\s*/g,"");let o=f.from("vesting_events").select(_).eq("company_id",i);e&&e.length>0&&(o=o.in("grant_id",e),m=1e3),r&&r!=="all"&&(o=o.eq("status",r)),a&&a!=="all"&&(o=o.eq("event_type",a));const h=await o.order("vesting_date",{ascending:!0}).limit(m);c=h.data??[],s=h.error}if(console.log("📥 Raw query result:",{events:(c==null?void 0:c.length)||0,error:s}),s)throw console.error("❌ Supabase query error:",s),s;const w=new Date;console.log("🔄 Processing events:",(c==null?void 0:c.length)||0);const E=(c||[]).map(_=>{var P,S,x,$,U,k,R,V,N,O,A;const o=new Date(_.vesting_date),h=Math.ceil((o.getTime()-w.getTime())/(1e3*60*60*24)),b=((S=(P=_.grants)==null?void 0:P.incentive_plans)==null?void 0:S.plan_type)||"LTIP_RSU",l=((x=_.grants)==null?void 0:x.grant_performance_metrics)||[],y=new Map;l.forEach(T=>{var L,G,F,H;const D=T.performance_metric_id;!D||y.has(D)||y.set(D,{id:D,name:(L=T.performance_metrics)==null?void 0:L.name,description:(G=T.performance_metrics)==null?void 0:G.description,metric_type:(F=T.performance_metrics)==null?void 0:F.metric_type,unit_of_measure:(H=T.performance_metrics)==null?void 0:H.unit_of_measure,target_value:null,actual_value:null,is_achieved:null,achieved_at:null})});const C=Array.from(y.values()),g=C.length>0,q=g&&Q.includes(_.event_type);return{..._,employee_name:`${(($=_.employees)==null?void 0:$.first_name_en)||((U=_.employees)==null?void 0:U.first_name_ar)||"Unknown"} ${((k=_.employees)==null?void 0:k.last_name_en)||((R=_.employees)==null?void 0:R.last_name_ar)||"Employee"}`,plan_name:((N=(V=_.grants)==null?void 0:V.incentive_plans)==null?void 0:N.plan_name_en)||"Unknown Plan",plan_code:((A=(O=_.grants)==null?void 0:O.incentive_plans)==null?void 0:A.plan_code)||"N/A",plan_type:b,days_remaining:h,can_exercise:b==="ESOP"&&_.status==="vested",requires_exercise:b==="ESOP",grantHasLinkedPerformanceMetrics:g,requiresPerformanceConfirmation:q,grantPerformanceMetrics:C}}),M=E.filter(_=>_.requiresPerformanceConfirmation);if(v&&M.length>0){const _=Array.from(new Set(M.map(o=>{var h;return(h=o.grants)==null?void 0:h.vesting_schedule_id}).filter(o=>!!o)));if(_.length>0){const{data:o,error:h}=await f.from("vesting_milestones").select(`
            id,
            vesting_schedule_id,
            sequence_order,
            target_value,
            actual_value,
            is_achieved,
            achieved_at,
            performance_metric_id,
            performance_metrics (
              id,
              name,
              description,
              metric_type,
              unit_of_measure
            )
          `).in("vesting_schedule_id",_);if(h)console.error("❌ Error fetching performance milestones:",h);else if(o&&o.length>0){const b=new Map;o.forEach(l=>{const y=`${l.vesting_schedule_id}:${l.sequence_order}`;b.set(y,l)}),M.forEach(l=>{var P,S,x,$,U,k,R;const y=(P=l.grants)==null?void 0:P.vesting_schedule_id;if(!y)return;const C=`${y}:${l.sequence_number}`,g=b.get(C);if(!g)return;l.performanceMilestoneId=g.id,l.performanceMetric={id:((S=g.performance_metrics)==null?void 0:S.id)||g.performance_metric_id,name:((x=g.performance_metrics)==null?void 0:x.name)||"Performance Metric",description:($=g.performance_metrics)==null?void 0:$.description,metric_type:(U=g.performance_metrics)==null?void 0:U.metric_type,unit_of_measure:(k=g.performance_metrics)==null?void 0:k.unit_of_measure,target_value:g.target_value,actual_value:g.actual_value,is_achieved:g.is_achieved,achieved_at:g.achieved_at};const q=l.performanceMetric.id;if(q){const V=((R=l.grantPerformanceMetrics)==null?void 0:R.findIndex(O=>O.id===q))??-1,N={id:q,name:l.performanceMetric.name,description:l.performanceMetric.description,metric_type:l.performanceMetric.metric_type,unit_of_measure:l.performanceMetric.unit_of_measure,target_value:l.performanceMetric.target_value??null,actual_value:l.performanceMetric.actual_value??null,is_achieved:l.performanceMetric.is_achieved??null,achieved_at:l.performanceMetric.achieved_at??null};V>=0&&l.grantPerformanceMetrics?l.grantPerformanceMetrics[V]={...l.grantPerformanceMetrics[V],...N}:l.grantPerformanceMetrics?l.grantPerformanceMetrics.push(N):l.grantPerformanceMetrics=[N]}})}}}return console.log("✅ Processed events:",E.length),E}catch(d){return console.error("❌ Error fetching all vesting events:",d),[]}},I=async(i,r=10)=>{try{const{data:a,error:m}=await f.from("vesting_events").select(`
        *,
        employees (
          id,
          first_name_en,
          first_name_ar,
          last_name_en,
          last_name_ar
        ),
        grants (
          id,
          grant_number,
          total_shares,
          vested_shares,
          plan_id,
          incentive_plans (
            plan_name_en,
            plan_code,
            plan_type
          ),
          grant_performance_metrics (
            performance_metric_id,
            performance_metrics (
              id,
              name,
              description,
              metric_type,
              unit_of_measure
            )
          )
        )
      `).eq("company_id",i).in("status",["pending","due"]).gte("vesting_date",new Date().toISOString().split("T")[0]).order("vesting_date",{ascending:!0}).limit(r);if(m)throw m;const e=new Date;return(a||[]).map(t=>{var E,M,_,o,h,b,l,y,C,g,q;const p=new Date(t.vesting_date),d=Math.ceil((p.getTime()-e.getTime())/(1e3*60*60*24)),n=((M=(E=t.grants)==null?void 0:E.incentive_plans)==null?void 0:M.plan_type)||"LTIP_RSU",u=((_=t.grants)==null?void 0:_.grant_performance_metrics)||[],c=new Map;u.forEach(P=>{var x,$,U,k;const S=P.performance_metric_id;!S||c.has(S)||c.set(S,{id:S,name:(x=P.performance_metrics)==null?void 0:x.name,description:($=P.performance_metrics)==null?void 0:$.description,metric_type:(U=P.performance_metrics)==null?void 0:U.metric_type,unit_of_measure:(k=P.performance_metrics)==null?void 0:k.unit_of_measure,target_value:null,actual_value:null,is_achieved:null,achieved_at:null})});const s=Array.from(c.values()),v=s.length>0,w=v&&Q.includes(t.event_type);return{...t,employee_name:`${((o=t.employees)==null?void 0:o.first_name_en)||((h=t.employees)==null?void 0:h.first_name_ar)||"Unknown"} ${((b=t.employees)==null?void 0:b.last_name_en)||((l=t.employees)==null?void 0:l.last_name_ar)||"Employee"}`,plan_name:((C=(y=t.grants)==null?void 0:y.incentive_plans)==null?void 0:C.plan_name_en)||"Unknown Plan",plan_code:((q=(g=t.grants)==null?void 0:g.incentive_plans)==null?void 0:q.plan_code)||"N/A",plan_type:n,days_remaining:Math.max(0,d),can_exercise:n==="ESOP"&&t.status==="vested",requires_exercise:n==="ESOP",grantHasLinkedPerformanceMetrics:v,requiresPerformanceConfirmation:w,grantPerformanceMetrics:s}})}catch(a){return console.error("Error fetching upcoming vesting events:",a),[]}},K=async(i,r)=>{try{const{data:a,error:m}=await f.rpc("process_vesting_event",{p_vesting_event_id:i,p_fair_market_value:r});if(m)throw console.error("RPC error:",m),m;return a&&typeof a=="object"&&"success"in a&&a.success===!1?{success:!1,error:a.error||"Failed to process vesting event"}:(window.dispatchEvent(new CustomEvent("refreshVestingEventsCount")),{success:!0,data:a})}catch(a){return console.error("Error processing vesting event:",a),{success:!1,error:a instanceof Error?a.message:"Unknown error"}}},z=async(i,r)=>{var a,m;try{const{data:e,error:t}=await f.from("vesting_events").select(`
        *,
        grants (
          incentive_plans (
            plan_type
          )
        )
      `).eq("id",i).single();if(t)throw t;if(!e)throw new Error("Vesting event not found");if(((m=(a=e.grants)==null?void 0:a.incentive_plans)==null?void 0:m.plan_type)!=="ESOP")throw new Error("Exercise is only available for ESOP plans");if(e.status!=="vested")throw new Error("Event must be vested before exercise");const p=r||e.shares_to_vest,d=p*(e.exercise_price||0),{error:n}=await f.from("vesting_events").update({status:"exercised",processed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",i);if(n)throw n;return window.dispatchEvent(new CustomEvent("refreshVestingEventsCount")),{success:!0,data:{shares_exercised:p,exercise_cost:d,event_id:i}}}catch(e){return console.error("Error exercising vesting event:",e),{success:!1,error:e instanceof Error?e.message:"Unknown error"}}},J=async i=>{var r,a,m;try{const{data:e,error:t}=await f.from("vesting_events").select(`
        *,
        grants (
          id,
          grant_number,
          company_id,
          incentive_plans (
            plan_type
          )
        ),
        employees (
          id
        )
      `).eq("id",i).single();if(t)throw t;if(!e)throw new Error("Vesting event not found");const p=(a=(r=e.grants)==null?void 0:r.incentive_plans)==null?void 0:a.plan_type;if(!["LTIP_RSU","LTIP_RSA"].includes(p||""))throw new Error("Transfer is only available for RSU/RSA plans");if(e.status!=="vested")throw new Error("Event must be vested before transfer");const d=e.company_id||((m=e.grants)==null?void 0:m.company_id);if(!d)throw new Error("Company ID not found");const{data:n,error:u}=await f.from("portfolios").select("id, portfolio_type, company_id, employee_id, portfolio_number").eq("company_id",d);if(u)throw console.error("Error fetching portfolios:",u),new Error(`Failed to fetch portfolios: ${u.message}`);console.log(`📊 Fetched ${(n==null?void 0:n.length)||0} portfolios for company ${d}`),console.log("Portfolios:",n==null?void 0:n.map(o=>({id:o.id,type:o.portfolio_type,company_id:o.company_id,employee_id:o.employee_id,number:o.portfolio_number})));const c=n==null?void 0:n.find(o=>o.portfolio_type==="company_reserved"&&o.company_id===d&&o.employee_id===null);let s=n==null?void 0:n.find(o=>o.portfolio_type==="employee_vested"&&o.employee_id===e.employee_id&&o.company_id===d);if(!c)throw console.error("Company reserved portfolio not found. Available portfolios:",n),console.error("Looking for: portfolio_type=company_reserved, company_id="+d+", employee_id=NULL"),new Error(`Company reserved portfolio not found for company ${d}. Found ${(n==null?void 0:n.length)||0} portfolio(s) but none match company_reserved type. Please ensure a company reserved portfolio exists for this company.`);if(!s){console.log("⚠️ Employee vested portfolio not found. Creating new portfolio for employee:",e.employee_id);const{data:o}=await f.from("employees").select("employee_number, first_name_en, last_name_en").eq("id",e.employee_id).single(),b=`PORT-EMPLOYEE-${(o==null?void 0:o.employee_number)||e.employee_id.substring(0,8)}`,{data:l,error:y}=await f.from("portfolios").insert({portfolio_type:"employee_vested",company_id:d,employee_id:e.employee_id,total_shares:0,available_shares:0,locked_shares:0,portfolio_number:b}).select().single();if(y)throw console.error("Error creating employee portfolio:",y),new Error(`Failed to create employee vested portfolio: ${y.message}. Please ensure the employee exists and has proper permissions.`);if(!l)throw new Error("Failed to create employee vested portfolio");s=l,console.log("✅ Created employee portfolio:",s.portfolio_number)}console.log("✅ Found portfolios - From:",c.portfolio_number,"To:",s.portfolio_number);const v=`TR-${new Date().toISOString().split("T")[0].replace(/-/g,"")}-${Math.random().toString(36).substr(2,6).toUpperCase()}`,{data:w,error:E}=await f.from("share_transfers").insert({transfer_number:v,company_id:d,grant_id:e.grant_id,employee_id:e.employee_id,from_portfolio_id:c.id,to_portfolio_id:s.id,shares_transferred:e.shares_to_vest,transfer_type:"vesting",transfer_date:new Date().toISOString().split("T")[0],status:"pending",processed_by_system:!1,notes:`Transfer request for vesting event ${i}`}).select().single();if(E)throw E;console.log('🔄 Updating vesting event status to "transferred" for event:',i);const{data:M,error:_}=await f.from("vesting_events").update({status:"transferred",updated_at:new Date().toISOString()}).eq("id",i).select().single();if(_)throw console.error("❌ Error updating vesting event status:",_),console.error("Error details:",{code:_.code,message:_.message,details:_.details,hint:_.hint}),new Error(`Failed to update vesting event status: ${_.message}`);if(M)console.log('✅ Updated vesting event status to "transferred" for event:',i),console.log("Updated event:",{id:M.id,status:M.status});else throw console.warn("⚠️ Vesting event update returned no data for event:",i),new Error("Vesting event status update returned no data");return window.dispatchEvent(new CustomEvent("refreshVestingEventsCount")),{success:!0,data:{transfer_id:w.id,transfer_number:v,shares_transferred:e.shares_to_vest,event_id:i,plan_type:p}}}catch(e){return console.error("Error transferring vesting event:",e),{success:!1,error:e instanceof Error?e.message:"Unknown error"}}},W=async()=>{try{const{error:i}=await f.rpc("update_vesting_event_status");if(i)throw i;return window.dispatchEvent(new CustomEvent("refreshVestingEventsCount")),{success:!0}}catch(i){return console.error("Error updating vesting event statuses:",i),{success:!1,error:i instanceof Error?i.message:"Unknown error"}}},Y=async i=>{try{const{error:r}=await f.rpc("generate_vesting_events_for_grant",{p_grant_id:i});if(r)throw r;return{success:!0}}catch(r){return console.error("Error generating vesting events:",r),{success:!1,error:r instanceof Error?r.message:"Unknown error"}}},X=async i=>{try{const{data:r,error:a}=await f.from("vesting_events").select("status, shares_to_vest, event_type").eq("company_id",i);if(a)throw a;return{success:!0,data:{total_events:(r==null?void 0:r.length)||0,total_total_shares:(r==null?void 0:r.reduce((e,t)=>e+(Number(t.shares_to_vest)||0),0))||0,pending_events:(r==null?void 0:r.filter(e=>e.status==="pending").length)||0,due_events:(r==null?void 0:r.filter(e=>e.status==="due").length)||0,vested_events:(r==null?void 0:r.filter(e=>e.status==="vested").length)||0,transferred_events:(r==null?void 0:r.filter(e=>e.status==="transferred").length)||0,exercised_events:(r==null?void 0:r.filter(e=>e.status==="exercised").length)||0,forfeited_events:(r==null?void 0:r.filter(e=>e.status==="forfeited").length)||0,cancelled_events:(r==null?void 0:r.filter(e=>e.status==="cancelled").length)||0,processed_events:(r==null?void 0:r.filter(e=>["transferred","exercised"].includes(e.status)).length)||0,total_pending_shares:(r==null?void 0:r.filter(e=>e.status==="pending").reduce((e,t)=>e+(Number(t.shares_to_vest)||0),0))||0,total_due_shares:(r==null?void 0:r.filter(e=>e.status==="due").reduce((e,t)=>e+(Number(t.shares_to_vest)||0),0))||0,total_vested_shares:(r==null?void 0:r.filter(e=>e.status==="vested").reduce((e,t)=>e+(Number(t.shares_to_vest)||0),0))||0,total_transferred_shares:(r==null?void 0:r.filter(e=>e.status==="transferred").reduce((e,t)=>e+(Number(t.shares_to_vest)||0),0))||0,total_exercised_shares:(r==null?void 0:r.filter(e=>e.status==="exercised").reduce((e,t)=>e+(Number(t.shares_to_vest)||0),0))||0,total_forfeited_shares:(r==null?void 0:r.filter(e=>e.status==="forfeited").reduce((e,t)=>e+(Number(t.shares_to_vest)||0),0))||0,total_cancelled_shares:(r==null?void 0:r.filter(e=>e.status==="cancelled").reduce((e,t)=>e+(Number(t.shares_to_vest)||0),0))||0,cliff_events:(r==null?void 0:r.filter(e=>e.event_type==="cliff").length)||0,time_based_events:(r==null?void 0:r.filter(e=>e.event_type==="time_based").length)||0}}}catch(r){return console.error("Error fetching vesting event stats:",r),{success:!1,error:r instanceof Error?r.message:"Unknown error"}}},Z=async(i,r)=>{var a,m,e,t;try{const{data:p,error:d}=await f.from("grants").select(`
        id,
        employee_id,
        total_shares,
        vesting_start_date,
        employees (
          first_name_en,
          first_name_ar,
          last_name_en,
          last_name_ar
        ),
        incentive_plans (
          plan_name_en,
          plan_code
        )
      `).eq("company_id",i).eq("status","active");if(d)throw d;const n=(p||[]).filter(c=>!r||r.length===0?!0:r.includes(c.id)),u={total_grants:(p==null?void 0:p.length)||0,selected_grants:n.length,processed:0,skipped:0,errors:0,error_details:[]};for(const c of p||[]){if(!n.find(s=>s.id===c.id)){u.skipped++;continue}try{const{data:s,error:v}=await f.from("vesting_events").select("id").eq("grant_id",c.id).limit(1);if(v)throw v;if(s&&s.length>0){console.log(`Grant ${c.id} already has vesting events - skipping`),u.skipped++;continue}const w=await Y(c.id);if(w.success){const E=`${((a=c.employees)==null?void 0:a.first_name_en)||((m=c.employees)==null?void 0:m.first_name_ar)||"Unknown"} ${((e=c.employees)==null?void 0:e.last_name_en)||((t=c.employees)==null?void 0:t.last_name_ar)||"Employee"}`;console.log(`Generated vesting events for grant ${c.id} (${E})`),u.processed++}else throw new Error(w.error||"Failed to generate vesting events")}catch(s){const v=`Grant ${c.id}: ${s instanceof Error?s.message:"Unknown error"}`;console.error(v),u.errors++,u.error_details.push(v)}}return await W(),{success:!0,data:u}}catch(p){return console.error("Error generating vesting events for existing grants:",p),{success:!1,error:p instanceof Error?p.message:"Unknown error"}}},ee=async i=>{var r,a,m,e,t,p,d;try{const{data:n,error:u}=await f.from("grants").select(`
        id,
        employee_id,
        grant_number,
        total_shares,
        vesting_start_date,
        created_at,
        employees (
          first_name_en,
          first_name_ar,
          last_name_en,
          last_name_ar
        ),
        incentive_plans (
          plan_name_en,
          plan_code,
          plan_type
        )
      `).eq("company_id",i).eq("status","active").order("created_at",{ascending:!1});if(u)throw u;const c=[];for(const s of n||[]){const{data:v,error:w}=await f.from("vesting_events").select("id").eq("grant_id",s.id).limit(1);if(w)throw w;(!v||v.length===0)&&c.push({...s,grant_number:s.grant_number,employee_name:`${((r=s.employees)==null?void 0:r.first_name_en)||((a=s.employees)==null?void 0:a.first_name_ar)||"Unknown"} ${((m=s.employees)==null?void 0:m.last_name_en)||((e=s.employees)==null?void 0:e.last_name_ar)||"Employee"}`,plan_name:(t=s.incentive_plans)==null?void 0:t.plan_name_en,plan_code:(p=s.incentive_plans)==null?void 0:p.plan_code,plan_type:(d=s.incentive_plans)==null?void 0:d.plan_type})}return{success:!0,data:c}}catch(n){return console.error("Error fetching grants without vesting events:",n),{success:!1,error:n instanceof Error?n.message:"Unknown error"}}};export{I as a,B as b,ee as c,Z as d,z as e,X as g,K as p,J as t,W as u};
