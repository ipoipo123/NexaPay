const DB_KEY = "nexapay_db_v1";
const SESSION_KEY = "nexapay_session_v1";

const defaultDB = {
  users: [{
    id: "u_demo",
    name: "Demo Student",
    username: "student",
    password: "1234",
    pin: "1234",
    balance: 2350,
    transactions: [{
      id: "TX-DEMO-001",
      type: "credit",
      title: "Initial wallet balance",
      detail: "Demo account",
      amount: 2350,
      date: new Date().toISOString()
    }]
  }]
};

function loadDB(){
  try{
    const stored=JSON.parse(localStorage.getItem(DB_KEY)||"null");
    if(stored&&Array.isArray(stored.users))return stored;
  }catch{}
  return JSON.parse(JSON.stringify(defaultDB));
}
let db = loadDB();
let currentUserId = localStorage.getItem(SESSION_KEY);
let pendingAction = null;
let pinReturnFocus = null;
let receiptReturnFocus = null;
const MAX_TRANSACTION_AMOUNT = 1_000_000;

function saveDB(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function saveSession(){ currentUserId ? localStorage.setItem(SESSION_KEY,currentUserId) : localStorage.removeItem(SESSION_KEY); }
function user(){ return db.users.find(u=>u.id===currentUserId); }
function peso(n){ return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(n)||0); }
function roundMoney(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100; }
function amountFromField(id){
  const input=document.getElementById(id), amount=Number(input.value);
  if(!input.value.trim() || !Number.isFinite(amount) || amount<1){toast("Enter an amount of at least ₱1.00.",true);return null;}
  if(amount>MAX_TRANSACTION_AMOUNT){toast("The maximum demo transaction is ₱1,000,000.00.",true);return null;}
  return roundMoney(amount);
}
function now(){ return new Date().toISOString(); }
function uid(prefix="U"){ return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2,6).toUpperCase(); }
function initials(name){ return (name||"U").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase(); }

function toast(msg,error=false){
  const el=document.createElement("div"); el.className="toast"+(error?" error":""); el.textContent=msg;
  document.getElementById("toast").appendChild(el); setTimeout(()=>el.remove(),3000);
}

function switchAuth(mode){
  document.querySelectorAll(".tab").forEach(b=>{
    const selected=b.dataset.auth===mode;
    b.classList.toggle("active",selected);
    b.setAttribute("aria-selected",String(selected));
  });
  document.getElementById("loginForm").classList.toggle("hidden",mode!=="login");
  document.getElementById("registerForm").classList.toggle("hidden",mode!=="register");
  document.getElementById("authHeading").textContent=mode==="login"?"Good to have you here":"Create your wallet";
  document.getElementById("authSubheading").textContent=mode==="login"?"Sign in or create an account to get started.":"Set up your NexaPay demo account in a few quick steps.";
  const skipLink=document.getElementById("skipLink");
  skipLink.href=mode==="login"?"#loginUsername":"#regName";
  skipLink.textContent=mode==="login"?"Skip to sign in":"Skip to create account";
}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>switchAuth(b.dataset.auth));

document.getElementById("loginForm").onsubmit=e=>{
  e.preventDefault();
  const username=document.getElementById("loginUsername").value.trim().toLowerCase();
  const password=document.getElementById("loginPassword").value;
  const found=db.users.find(u=>u.username.toLowerCase()===username && u.password===password);
  if(!found) return toast("Invalid username or password.",true);
  currentUserId=found.id; saveSession(); showApp(); toast("Welcome back, "+found.name+"!");
};

document.getElementById("registerForm").onsubmit=e=>{
  e.preventDefault();
  const name=document.getElementById("regName").value.trim();
  const username=document.getElementById("regUsername").value.trim().toLowerCase();
  const password=document.getElementById("regPassword").value;
  const pin=document.getElementById("regPin").value;
  if(!name) return toast("Enter your full name.",true);
  if(!/^[a-z0-9_]+$/.test(username)) return toast("Username can only use letters, numbers and underscore.",true);
  if(db.users.some(u=>u.username===username)) return toast("That username is already registered.",true);
  if(!/^\d{4}$/.test(pin)) return toast("PIN must be exactly 4 digits.",true);
  const newUser={id:uid("U"),name,username,password,pin,balance:0,transactions:[]};
  db.users.push(newUser); saveDB(); currentUserId=newUser.id; saveSession(); showApp();
  toast("Account created successfully!");
  e.target.reset();
};

function showApp(){
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  const skipLink=document.getElementById("skipLink");
  skipLink.href="#mainContent";
  skipLink.textContent="Skip to main content";
  updateUI(); showPage("dashboard");
  document.getElementById("mainContent").focus();
}
function logout(){
  document.title="NexaPay — Digital Wallet";
  currentUserId=null; saveSession(); document.getElementById("appScreen").classList.add("hidden");
  document.getElementById("authScreen").classList.remove("hidden"); switchAuth("login");
  document.getElementById("loginForm").reset();
  document.getElementById("registerForm").reset();
  ["addAmount","sendRecipient","sendAmount","withdrawAmount","confirmPin"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("pinModal").classList.add("hidden");
  document.getElementById("receiptModal").classList.add("hidden");
  clearAmountSelection();
  pendingAction=null; pinReturnFocus=null; receiptReturnFocus=null;
  document.getElementById("loginUsername").focus();
}
document.getElementById("logoutBtn").onclick=logout;

function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  document.getElementById("page-"+page).classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(n=>{
    const active=n.dataset.page===page;
    n.classList.toggle("active",active);
    if(active)n.setAttribute("aria-current","page");else n.removeAttribute("aria-current");
  });
  const titles={dashboard:"Dashboard",add:"Add Money",send:"Send Money",withdraw:"Withdraw",qr:"My QR",transactions:"Transactions",profile:"My Profile"};
  document.getElementById("pageTitle").textContent=titles[page];
  document.title=titles[page]+" · NexaPay";
  if(page==="qr") generateQR();
  if(page==="transactions") renderTransactions();
}
document.querySelectorAll(".nav-item").forEach(n=>n.onclick=()=>showPage(n.dataset.page));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>showPage(b.dataset.go));

function updateUI(){
  const u=user(); if(!u) return;
  const ini=initials(u.name);
  document.getElementById("sideName").textContent=u.name;
  document.getElementById("sideUsername").textContent="@"+u.username;
  document.getElementById("topName").textContent=u.name;
  document.getElementById("avatar").textContent=ini;
  document.getElementById("topAvatar").textContent=ini;
  document.getElementById("profileAvatar").textContent=ini;
  document.getElementById("profileName").textContent=u.name;
  document.getElementById("profileUsername").textContent="@"+u.username;
  document.getElementById("greetingName").textContent=u.name.trim().split(/\s+/)[0]||"there";
  document.getElementById("dashBalance").textContent=peso(u.balance);
  document.getElementById("sendBalance").textContent=peso(u.balance);
  document.getElementById("withdrawBalance").textContent=peso(u.balance);
  document.getElementById("profileBalance").textContent=peso(u.balance);
  document.getElementById("profileCount").textContent=u.transactions.length;
  renderRecent();
}
function renderRecent(){
  const box=document.getElementById("recentTransactions"); const u=user();
  if(!u.transactions.length){box.innerHTML='<p class="muted">No transactions yet.</p>';return;}
  box.innerHTML=u.transactions.slice().reverse().slice(0,5).map(tx=>txHTML(tx)).join("");
}
function txHTML(tx){
  const positive=tx.type==="credit"; return `<div class="tx">
    <div class="tx-icon">${positive?"↓":"↑"}</div>
    <div class="tx-info"><b>${escapeHTML(tx.title)}</b><small>${escapeHTML(tx.detail)}</small></div>
    <div class="tx-amount ${positive?"plus":"minus"}">${positive?"+":"-"}${peso(tx.amount)}</div>
  </div>`;
}
function renderTransactions(){
  const body=document.getElementById("transactionTable"), u=user();
  if(!u.transactions.length){body.innerHTML='<tr><td colspan="4" class="muted">No transactions yet.</td></tr>';return;}
  body.innerHTML=u.transactions.slice().reverse().map(tx=>`<tr>
    <td>${tx.type==="credit"?"<span class='plus'>CREDIT</span>":"<span class='minus'>DEBIT</span>"}</td>
    <td><b>${escapeHTML(tx.title)}</b><br><small>${escapeHTML(tx.detail)}</small></td>
    <td class="${tx.type==="credit"?"plus":"minus"}">${tx.type==="credit"?"+":"-"}${peso(tx.amount)}</td>
    <td>${new Date(tx.date).toLocaleString()}</td>
  </tr>`).join("");
}
function addTx(type,title,detail,amount){
  user().transactions.push({id:uid("TX"),type,title,detail,amount,date:now()});
}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

function clearAmountSelection(){
  document.querySelectorAll(".amounts button").forEach(b=>{
    b.classList.remove("selected");
    b.setAttribute("aria-pressed","false");
  });
}
document.querySelectorAll(".amounts button").forEach(b=>b.onclick=()=>{
  document.getElementById("addAmount").value=b.dataset.amount;
  document.querySelectorAll(".amounts button").forEach(option=>{
    const selected=option===b;
    option.classList.toggle("selected",selected);
    option.setAttribute("aria-pressed",String(selected));
  });
});
document.getElementById("addAmount").addEventListener("input",clearAmountSelection);
document.getElementById("addMoneyBtn").onclick=()=>{
  const amount=amountFromField("addAmount");
  if(amount===null) return;
  pendingAction={kind:"add",amount};
  openPin("Add "+peso(amount)+" to your wallet?");
};
document.getElementById("sendMoneyBtn").onclick=()=>{
  const recipient=document.getElementById("sendRecipient").value.trim().replace(/^@/,"").toLowerCase();
  if(!recipient) return toast("Enter the recipient username.",true);
  const u=user();
  const target=db.users.find(x=>x.username===recipient);
  if(!target) return toast("Recipient does not exist.",true);
  if(target.id===u.id) return toast("You cannot send money to yourself.",true);
  const amount=amountFromField("sendAmount");
  if(amount===null) return;
  if(amount>u.balance) return toast("Insufficient balance.",true);
  pendingAction={kind:"send",amount,targetId:target.id};
  openPin(`Send ${peso(amount)} to @${target.username}?`);
};
document.getElementById("withdrawBtn").onclick=()=>{
  const amount=amountFromField("withdrawAmount");
  if(amount===null) return;
  if(amount>user().balance) return toast("Insufficient balance.",true);
  pendingAction={kind:"withdraw",amount};
  openPin("Withdraw "+peso(amount)+" from your wallet?");
};

function openPin(message){
  pinReturnFocus=document.activeElement;
  document.getElementById("pinMessage").textContent=message;
  document.getElementById("confirmPin").value="";
  document.getElementById("pinModal").classList.remove("hidden");
  document.getElementById("confirmPin").focus();
}
function closePin(){
  document.getElementById("pinModal").classList.add("hidden");
  pendingAction=null;
  if(pinReturnFocus?.isConnected)pinReturnFocus.focus();
  pinReturnFocus=null;
}
document.getElementById("closeModal").onclick=closePin;
document.getElementById("confirmPinBtn").onclick=confirmPin;
document.getElementById("confirmPin").onkeydown=e=>{if(e.key==="Enter")confirmPin();};

function confirmPin(){
  if(!pendingAction) return;
  if(document.getElementById("confirmPin").value!==user().pin) return toast("Incorrect PIN.",true);
  const a=pendingAction, u=user(); let receipt;
  if(a.kind==="add"){
    u.balance=roundMoney(u.balance+a.amount); addTx("credit","Money added","Wallet top-up",a.amount);
    receipt={title:"Money Added",detail:"Wallet top-up",amount:a.amount,recipient:u.name};
    document.getElementById("addAmount").value="";
    clearAmountSelection();
  } else if(a.kind==="withdraw"){
    u.balance=roundMoney(u.balance-a.amount); addTx("debit","Cash withdrawal","Demo cash-out",a.amount);
    receipt={title:"Withdrawal",detail:"Demo cash-out",amount:a.amount,recipient:u.name};
    document.getElementById("withdrawAmount").value="";
  } else {
    const target=db.users.find(x=>x.id===a.targetId);
    u.balance=roundMoney(u.balance-a.amount); target.balance=roundMoney(target.balance+a.amount);
    addTx("debit","Sent to @"+target.username,"Transfer",a.amount);
    target.transactions.push({id:uid("TX"),type:"credit",title:"Received from @"+u.username,detail:"Transfer",amount:a.amount,date:now()});
    receipt={title:"Money Sent",detail:"Transfer to @"+target.username,amount:a.amount,recipient:target.name};
    document.getElementById("sendAmount").value=""; document.getElementById("sendRecipient").value="";
  }
  saveDB(); updateUI(); closePin(); showReceipt(receipt); toast("Transaction completed.");
}
function showReceipt(r){
  receiptReturnFocus=document.activeElement;
  document.getElementById("receiptContent").innerHTML=`
    <div class="receipt-body">
      <div class="receipt-row"><span>Transaction</span><b>${escapeHTML(r.title)}</b></div>
      <div class="receipt-row"><span>Details</span><b>${escapeHTML(r.detail)}</b></div>
      <div class="receipt-row"><span>Amount</span><b>${peso(r.amount)}</b></div>
      <div class="receipt-row"><span>Account</span><b>@${escapeHTML(user().username)}</b></div>
      <div class="receipt-row"><span>Date</span><b>${new Date().toLocaleString()}</b></div>
      <div class="receipt-row"><span>Status</span><b class="plus">COMPLETED</b></div>
    </div>`;
  document.getElementById("receiptModal").classList.remove("hidden");
  document.getElementById("closeReceipt").focus();
}
function closeReceipt(){
  document.getElementById("receiptModal").classList.add("hidden");
  if(receiptReturnFocus?.isConnected)receiptReturnFocus.focus();
  receiptReturnFocus=null;
}
document.getElementById("closeReceipt").onclick=closeReceipt;
document.getElementById("closeReceipt2").onclick=closeReceipt;
document.getElementById("pinModal").addEventListener("click",e=>{if(e.target===e.currentTarget)closePin();});
document.getElementById("receiptModal").addEventListener("click",e=>{if(e.target===e.currentTarget)closeReceipt();});
document.addEventListener("keydown",e=>{
  const pinModal=document.getElementById("pinModal"), receiptModal=document.getElementById("receiptModal");
  const modal=!receiptModal.classList.contains("hidden")?receiptModal:!pinModal.classList.contains("hidden")?pinModal:null;
  if(!modal)return;
  if(e.key==="Escape"){
    e.preventDefault();
    if(modal===receiptModal)closeReceipt();else closePin();
    return;
  }
  if(e.key!=="Tab")return;
  const focusable=[...modal.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(el=>el.offsetParent!==null);
  if(!focusable.length)return;
  const first=focusable[0], last=focusable[focusable.length-1];
  if(!modal.contains(document.activeElement)){e.preventDefault();first.focus();}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
document.getElementById("printReceipt").onclick=()=>{
  document.body.classList.add("printing-receipt");
  window.print();
};

function generateQR(){
  const u=user(); document.getElementById("qrUsername").textContent="@"+u.username;
  const box=document.getElementById("qrcode"); box.innerHTML="";
  if(window.QRCode){
    new QRCode(box,{text:"NexaPay|"+u.username,width:180,height:180,colorDark:"#17202a",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});
  }else box.innerHTML="<div class='notice'>QR library could not load. Use the username instead.</div>";
}
document.getElementById("downloadQR").onclick=()=>{
  const u=user(); const old=document.title; document.title="NexaPay QR - @"+u.username;
  document.body.classList.add("printing-qr");
  window.print(); document.title=old;
};
window.addEventListener("afterprint",()=>document.body.classList.remove("printing-receipt","printing-qr"));
document.getElementById("clearTransactions").onclick=()=>{
  if(!confirm("Clear your transaction history? This will not change your balance.")) return;
  user().transactions=[]; saveDB(); updateUI(); renderTransactions(); toast("Transaction history cleared.");
};

if(currentUserId && user()) showApp();
else document.getElementById("authScreen").classList.remove("hidden");

window.addEventListener("storage",e=>{
  const previousUserId=currentUserId;
  if(e.key===SESSION_KEY||e.key===null)currentUserId=localStorage.getItem(SESSION_KEY);
  if(e.key===DB_KEY||e.key===null)db=loadDB();
  if(currentUserId&&user()){
    if(currentUserId!==previousUserId)showApp();else updateUI();
  }else if(!document.getElementById("appScreen").classList.contains("hidden"))logout();
});
