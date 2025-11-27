import{s as p,j as e,a as X}from"./index-DeFA-a9n.js";import{r as u}from"./react-vendor-xiFAdxLt.js";import{f as M}from"./dateUtils-DoPl8O0G.js";import{y as Q,z as Z,F as ee,H as te,Y as V,q,a as ae,s as ne}from"./ui-vendor-a8g5-7pO.js";import"./supabase-vendor-B-LuImWU.js";function se(){const[y,S]=u.useState([]),[F,O]=u.useState(!0),[A,U]=u.useState(""),[N,Y]=u.useState("all"),[d,W]=u.useState(null),[H,f]=u.useState(!1),[j,P]=u.useState(!1);u.useEffect(()=>{k()},[]);const k=async()=>{try{const{data:{user:t}}=await p.auth.getUser();if(!t){console.log("No authenticated user");return}const{data:a,error:r}=await p.from("employees").select("id, company_id, first_name_en, last_name_en, email, user_id").eq("user_id",t.id).maybeSingle();if(r||!a){console.error("Error loading employee data:",r);return}console.log("Loading documents for employee:",a);const{data:n,error:o}=await p.from("generated_documents").select(`
          *,
          grants(
            id,
            grant_number,
            status,
            employee_acceptance_at,
            total_shares,
            grant_date,
            vesting_start_date,
            vesting_end_date
          )
        `).eq("employee_id",a.id).order("generated_at",{ascending:!1});if(o){console.error("Error loading generated documents:",o),await G(a);return}const l=(n||[]).map(s=>{const i=s.grants;let c=s.status||"draft";return i!=null&&i.employee_acceptance_at?c="signed":(!c||c==="draft")&&((i==null?void 0:i.status)==="pending_signature"?c="pending_signature":c||(c="draft")),{id:s.id,document_name:s.document_name||"Grant Agreement",document_type:s.document_type||"grant_agreement",status:c,generated_at:s.generated_at,document_content:s.document_content||D(a,{grants:i}),grant_data:i}});S(l)}catch(t){console.error("Error loading documents:",t);const a=sessionStorage.getItem("employee");if(a){const r=JSON.parse(a);await G(r)}}finally{O(!1)}},G=async t=>{try{const{data:a}=await p.from("grants").select("id, status, employee_acceptance_at").eq("employee_id",t.id).in("status",["active","pending_signature"]),n=(a==null?void 0:a.some(i=>i.status==="active"))?"signed":"pending_signature",o=a==null?void 0:a.find(i=>i.status==="active"),l={id:"sample-grant-1",status:n,grant_data:o},s=[{id:"sample-grant-1",document_name:"Employee Stock Grant Agreement",document_type:"grant_agreement",status:n,generated_at:new Date().toISOString(),document_content:D(t,l)}];S(s)}catch(a){console.error("Error creating sample documents:",a);const r={id:"sample-grant-1",status:"pending_signature",grant_data:null},n=[{id:"sample-grant-1",document_name:"Employee Stock Grant Agreement",document_type:"grant_agreement",status:"pending_signature",generated_at:new Date().toISOString(),document_content:D(t,r)}];S(n)}},z=(t,a)=>{const o=Math.floor(12500),l=5e4-o,s=12,c=48-s,x=new Date,h=new Date(x.getTime()+s*30*24*60*60*1e3),_=m=>{const T=String(m.getDate()).padStart(2,"0"),v=String(m.getMonth()+1).padStart(2,"0"),C=m.getFullYear();return`${T}/${v}/${C}`};let g,b,w,R;g=12,b="Year",w=Math.floor(c/12),R=Math.floor(l/w);let E=`
┌─────────────────┬──────────────┬─────────────┬─────────────────┬─────────────────┐
│ Vesting Period  │ Vesting Date │ Percentage  │ Shares Vesting │ Cumulative %    │
├─────────────────┼──────────────┼─────────────┼─────────────────┼─────────────────┤
│ Cliff Period    │ ${_(h).padEnd(12)} │ ${25 .toFixed(2)}%      │ ${o.toLocaleString().padEnd(15)} │ ${25 .toFixed(2)}%          │`;for(let m=1;m<=w;m++){const T=new Date(h.getTime()+m*g*30*24*60*60*1e3),v=l/w/5e4*100,C=(25+m*v).toFixed(2);E+=`
│ ${b} ${m.toString().padStart(2)}          │ ${_(T).padEnd(12)} │ ${v.toFixed(2)}%      │ ${R.toLocaleString().padEnd(15)} │ ${C}%          │`}return E+=`
├─────────────────┼──────────────┼─────────────┼─────────────────┼─────────────────┤
│ TOTAL           │              │ 100.00%     │ ${5e4.toLocaleString().padEnd(15)} │ 100.00%         │
└─────────────────┴──────────────┴─────────────┴─────────────────┴─────────────────┘

VESTING SCHEDULE NOTES:
• Cliff Period: 25% of shares vest after ${s} months of continuous employment
• Post-Cliff Vesting: Remaining 75% vests in ${g===12?"annual":g===6?"semi-annual":g===3?"quarterly":"monthly"} installments over ${c} months
• Vesting is subject to continued employment with the company
• Shares may be subject to additional restrictions as per company policy
• Tax implications may apply upon vesting - consult with tax advisor`,E},D=(t,a)=>{const n=(()=>{const s=a.grant_data||{};if((a.status==="signed"||s.status==="active")&&s.employee_acceptance_at){const c=new Date(s.employee_acceptance_at),x=h=>{const _=String(h.getDate()).padStart(2,"0"),g=String(h.getMonth()+1).padStart(2,"0"),b=h.getFullYear();return`${_}/${g}/${b}`};return{employeeSignature:`${t.first_name_en} ${t.last_name_en}`,employeeDate:x(c),employeeTime:c.toLocaleTimeString(),isSigned:!0}}return{employeeSignature:"_________________",employeeDate:"________",employeeTime:"",isSigned:!1}})(),o=new Date,l=s=>{const i=String(s.getDate()).padStart(2,"0"),c=String(s.getMonth()+1).padStart(2,"0"),x=s.getFullYear();return`${i}/${c}/${x}`};return`
${"=".repeat(80)}
                    EMPLOYEE STOCK GRANT AGREEMENT
${"=".repeat(80)}

Grant Number: GR-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,"0")}${String(new Date().getDate()).padStart(2,"0")}-001
Document Generated: ${l(o)} at ${o.toLocaleTimeString()}

${"=".repeat(80)}

Dear ${t.first_name_en} ${t.last_name_en},

We are pleased to inform you that you have been granted an equity award under our Employee Stock Grant Program. This letter serves as your official grant agreement and outlines the terms and conditions of your equity award.

GRANT DETAILS:
• Employee Name: ${t.first_name_en} ${t.last_name_en}
• Employee Email: ${t.email}
• Total Shares Granted: 50,000 shares
• Grant Date: ${l(new Date)}
• Vesting Schedule: 4 years with 1-year cliff
• Vesting Start Date: ${l(new Date)}
• Vesting End Date: ${l(new Date(Date.now()+4*365*24*60*60*1e3))}

VESTING SCHEDULE OVERVIEW:
• Cliff Period: 25% of shares vest after 1 year of continuous employment
• Post-Cliff Vesting: Remaining 75% vests in annual installments over 3 years
• Total Vesting Period: 4 years from grant date

DETAILED VESTING SCHEDULE:
${z()}

TERMS AND CONDITIONS:
1. Employment Requirement: Shares will only vest if you remain employed with the company
2. Equity Plan: These shares are subject to the terms of our equity incentive plan
3. Tax Implications: You may be subject to tax obligations upon vesting - please consult with a tax advisor
4. Transfer Restrictions: Shares may be subject to transfer restrictions as per company policy
5. Plan Amendments: The company reserves the right to amend the equity plan with proper notice

ACCEPTANCE AND SIGNATURE:
By signing below, you acknowledge that you have read, understood, and agree to the terms and conditions of this grant agreement.

Employee Signature: ${n.employeeSignature}
Employee Date: ${n.employeeDate}${n.employeeTime?` at ${n.employeeTime}`:""}

Company Representative: _________________ Date: _________

${n.isSigned?`
${"=".repeat(80)}
                    SIGNATURE VERIFICATION
${"=".repeat(80)}
✓ This contract has been electronically signed by the employee
✓ Signature Date: ${n.employeeDate} at ${n.employeeTime}
✓ Employee: ${t.first_name_en} ${t.last_name_en} (${t.email})
✓ Contract Status: EXECUTED
✓ This agreement is now legally binding and effective
`:`
${"=".repeat(80)}
                    PENDING SIGNATURE
${"=".repeat(80)}
This contract is awaiting your signature and acceptance.
Please review the terms carefully before signing.
`}

${"=".repeat(80)}
                    DOCUMENT METADATA
${"=".repeat(80)}
• Document ID: ${a.id||"N/A"}
• Generated: ${l(o)} at ${o.toLocaleTimeString()}
• Status: ${a.status||"pending_signature"}
• Employee ID: ${t.id||"N/A"}

This agreement is subject to the terms and conditions of the company's equity incentive plan.
For questions regarding this grant, please contact the Human Resources department.

${"=".repeat(80)}
    `.trim()},$=y.filter(t=>{const a=t.document_name.toLowerCase().includes(A.toLowerCase()),r=N==="all"||t.document_type===N;return a&&r}),I=t=>{const a=`
=====================================================
CONFIDENTIAL DOCUMENT
Generated: ${M(t.generated_at)}
Document ID: ${t.id}
Status: ${t.status.toUpperCase()}
=====================================================

${t.document_content}

=====================================================
This document is confidential and intended solely
for the use of the individual to whom it is addressed.
Any dissemination, distribution, or copying of this
document is strictly prohibited.

Document authenticity can be verified at:
https://example.com/verify/${t.id}
=====================================================
    `,r=new Blob([a],{type:"text/plain"}),n=URL.createObjectURL(r),o=document.createElement("a");o.href=n,o.download=`${t.document_name.replace(/[^a-z0-9]/gi,"_")}.txt`,o.click(),URL.revokeObjectURL(n)},L=async t=>{if(!(!(t!=null&&t.grant_data)||j))try{P(!0);const{data:{user:a}}=await p.auth.getUser();if(!a){alert("You need to be signed in to accept a contract.");return}const{error:r}=await p.from("generated_documents").update({status:"signed"}).eq("id",t.id);if(r)throw r;const{error:n}=await p.from("grants").update({status:"active",employee_acceptance_at:new Date().toISOString()}).eq("id",t.grant_data.id);if(n)throw n;alert("Thank you! Your contract has been accepted."),f(!1),await k()}catch(a){console.error("Error accepting document:",a),alert("Failed to accept the contract. Please try again.")}finally{P(!1)}},B=t=>{switch(t){case"signed":case"executed":return e.jsx(ne,{className:"w-5 h-5 text-green-600"});case"pending_signature":return e.jsx(ae,{className:"w-5 h-5 text-yellow-600"});default:return e.jsx(q,{className:"w-5 h-5 text-gray-400"})}},J=t=>{switch(t){case"signed":case"executed":return"bg-green-100 text-green-800";case"pending_signature":return"bg-yellow-100 text-yellow-800";case"draft":return"bg-gray-100 text-gray-600";default:return"bg-gray-100 text-gray-600"}},K=["all","grant_agreement","exercise_notice","amendment","termination"];return e.jsxs("div",{className:"bg-white rounded-xl border border-gray-200 shadow-sm",children:[e.jsxs("div",{className:"p-6 border-b border-gray-200",children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"text-xl font-bold text-gray-900",children:"Document Center"}),e.jsx("p",{className:"text-sm text-gray-600 mt-1",children:"Access and download your equity documents"})]}),e.jsx("div",{className:"flex items-center space-x-2",children:e.jsxs("span",{className:"px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium",children:[$.length," documents"]})})]}),e.jsxs("div",{className:"flex items-center space-x-3",children:[e.jsxs("div",{className:"flex-1 relative",children:[e.jsx(Q,{className:"absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"}),e.jsx("input",{type:"text",value:A,onChange:t=>U(t.target.value),placeholder:"Search documents...",className:"w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"})]}),e.jsxs("div",{className:"relative",children:[e.jsx(Z,{className:"absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"}),e.jsx("select",{value:N,onChange:t=>Y(t.target.value),className:"pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white",children:K.map(t=>e.jsx("option",{value:t,children:t==="all"?"All Types":t.replace("_"," ")},t))})]})]})]}),e.jsx("div",{className:"p-6",children:F?e.jsxs("div",{className:"text-center py-12",children:[e.jsx("div",{className:"animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"}),e.jsx("p",{className:"text-gray-500 mt-4",children:"Loading documents..."})]}):$.length===0?e.jsxs("div",{className:"text-center py-12",children:[e.jsx(ee,{className:"w-16 h-16 text-gray-300 mx-auto mb-4"}),e.jsx("p",{className:"text-gray-500 font-medium",children:"No documents found"}),e.jsx("p",{className:"text-sm text-gray-400 mt-1",children:"Try adjusting your search or filters"})]}):e.jsx("div",{className:"space-y-3",children:$.map(t=>e.jsx("div",{className:"border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition",children:e.jsxs("div",{className:"flex items-start justify-between",children:[e.jsxs("div",{className:"flex items-start space-x-3 flex-1",children:[e.jsx("div",{className:"mt-1",children:B(t.status)}),e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("h4",{className:"font-semibold text-gray-900 truncate",children:t.document_name}),e.jsxs("div",{className:"flex items-center space-x-3 mt-1",children:[e.jsxs("span",{className:"text-xs text-gray-500",children:["Generated: ",M(t.generated_at)]}),e.jsx("span",{className:`px-2 py-0.5 text-xs font-medium rounded-full ${J(t.status)}`,children:t.status.replace("_"," ")}),e.jsx("span",{className:"text-xs text-gray-500 capitalize",children:t.document_type.replace("_"," ")})]})]})]}),e.jsxs("div",{className:"flex items-center space-x-2 ml-4",children:[e.jsx("button",{onClick:()=>{W(t),f(!0)},className:"p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition",title:"Preview",children:e.jsx(te,{className:"w-5 h-5"})}),t.status==="pending_signature"&&t.grant_data&&e.jsx("button",{onClick:()=>L(t),className:"px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition",title:"Accept Contract",children:"Accept"}),e.jsx("button",{onClick:()=>I(t),className:"p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition",title:"Download",children:e.jsx(V,{className:"w-5 h-5"})})]})]})},t.id))})}),e.jsx("div",{className:"p-6 bg-gray-50 border-t border-gray-200 rounded-b-xl",children:e.jsxs("div",{className:"flex items-start space-x-3",children:[e.jsx(q,{className:"w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0"}),e.jsxs("div",{className:"text-sm text-gray-600",children:[e.jsx("p",{className:"font-semibold text-gray-900 mb-1",children:"About Watermarking"}),e.jsx("p",{children:"All downloaded documents are automatically watermarked with your information and a unique document ID for security and authenticity verification."})]})]})}),H&&d&&e.jsx("div",{className:"fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4",children:e.jsxs("div",{className:"bg-white rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col",children:[e.jsxs("div",{className:"sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between",children:[e.jsx("h2",{className:"text-xl font-semibold text-gray-900",children:d.document_name}),e.jsx("button",{onClick:()=>f(!1),className:"text-gray-400 hover:text-gray-600 transition",children:e.jsx("svg",{className:"w-6 h-6",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M6 18L18 6M6 6l12 12"})})})]}),e.jsx("div",{className:"p-6 overflow-y-auto",style:{maxHeight:"calc(90vh - 140px)"},children:e.jsxs("div",{className:"bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200",children:[e.jsx("p",{className:"text-xs text-gray-500 mb-2",children:"Document Preview - Watermark will be added on download"}),e.jsx("pre",{className:"text-sm text-gray-700 whitespace-pre-wrap font-mono",children:d.document_content})]})}),e.jsxs("div",{className:"sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3",children:[e.jsxs("div",{className:"flex items-center gap-3 text-sm",children:[e.jsxs("button",{onClick:()=>{I(d)},className:"inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition",children:[e.jsx(V,{className:"w-4 h-4"}),"Download with Watermark"]}),e.jsx("span",{className:`px-2 py-1 rounded-full text-xs font-medium ${d.status==="pending_signature"?"bg-yellow-100 text-yellow-800":d.status==="signed"?"bg-green-100 text-green-800":"bg-gray-100 text-gray-600"}`,children:d.status.replace("_"," ").toUpperCase()})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("button",{onClick:()=>f(!1),className:"px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition",children:"Close"}),d.status==="pending_signature"&&e.jsx("button",{onClick:()=>L(d),className:"px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50",disabled:j,children:j?"Accepting...":"Accept Contract"})]})]})]})})]})}function de(){const{t:y}=X();return e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-2xl font-bold text-gray-900",children:y("employeeDocuments.title")}),e.jsx("p",{className:"text-gray-600 mt-1",children:y("employeeDocuments.description")})]}),e.jsx(se,{})]})}export{de as default};
