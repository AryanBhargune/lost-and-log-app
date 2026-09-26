// ============================================
// STEP A — PASTE YOUR FIREBASE CONFIG BELOW
// (from Firebase Console → Project Settings → Your apps → Web app)
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc,
  onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAC5oHRPFajkS0NroydBUzQWxEBq9FX0Es",
  authDomain: "lost-and-log.firebaseapp.com",
  projectId: "lost-and-log",
  storageBucket: "lost-and-log.firebasestorage.app",
  messagingSenderId: "257802315970",
  appId: "1:257802315970:web:aa2230aba5eb9426c3335b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================
// STEP B — the app itself (no need to edit below)
// ============================================

var state = { myId: null, myName: "", reports: [], view: "home", foundReportId: null };

function $(id){ return document.getElementById(id); }
function esc(s){ var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
function timeAgo(ts){
  if(!ts) return "";
  var diff = Date.now() - ts;
  var m = Math.floor(diff/60000);
  if(m < 1) return "just now";
  if(m < 60) return m + "m ago";
  var h = Math.floor(m/60);
  if(h < 24) return h + "h ago";
  return Math.floor(h/24) + "d ago";
}
function showToast(msg){
  $("toastMsg").textContent = msg;
  var t = $("toast");
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(function(){ t.classList.remove("show"); }, 3500);
}

// ---------------- identity (simple, local, no auth) ----------------
function initIdentity(){
  state.myId = localStorage.getItem("llUserId");
  state.myName = localStorage.getItem("llUserName");
  if(!state.myId){
    state.myId = "u_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("llUserId", state.myId);
  }
  if(!state.myName){
    $("nameOverlay").classList.add("show");
  }
}
$("nameSubmitBtn").addEventListener("click", function(){
  var val = $("nameInput").value.trim();
  if(!val) return;
  state.myName = val;
  localStorage.setItem("llUserName", val);
  $("nameOverlay").classList.remove("show");
});

// ---------------- nav ----------------
function setActiveNav(){
  document.querySelectorAll(".navbtn").forEach(function(b){
    b.classList.toggle("active", b.getAttribute("data-view") === state.view);
  });
}
function setView(v){
  state.view = v;
  setActiveNav();
  render();
  if(v === "notifications") markNotifsRead();
}

// ---------------- render ----------------
function render(){
  if(state.view === "home") renderHome();
  else if(state.view === "myreports") renderMyReports();
  else if(state.view === "notifications") renderNotifications();
  renderBadge();
}
function renderBadge(){
  var count = state.reports.filter(function(r){
    return r.reporterId === state.myId && r.status === "matched" && !r.acknowledged;
  }).length;
  var b = $("notifBadge");
  if(count > 0){ b.style.display = "flex"; b.textContent = count > 9 ? "9+" : String(count); }
  else b.style.display = "none";
}
function cardThumb(){ return ''; }

function renderHome(){
  var active = state.reports.filter(function(r){ return r.status === "pending"; });
  var html = '<div class="section-label"><span>THE BOARD</span><span class="count">' + active.length + ' open</span></div>';
  html += '<button class="btn btn-primary" id="openLostBtn" style="margin-bottom:20px;">+ File a Lost-Item Ticket</button>';

  if(active.length === 0){
    html += '<div class="empty"><div class="icon">&#9679;</div><p>The board is clear. Nothing reported lost.</p></div>';
  } else {
    active.forEach(function(r){
      html += '<div class="card">' +
        '<div class="card-cat">' + esc(r.category) + '</div>' +
        '<div class="card-desc">' + esc(r.description) + '</div>' +
        '<div class="card-meta"><span>FILED ' + timeAgo(r.createdAt) + '</span></div>' +
        '<div class="card-actions"><button class="btn btn-small found-btn" data-id="' + r.id + '">I Found This</button></div></div>';
    });
  }
  $("main").innerHTML = html;
  var lb = $("openLostBtn");
  if(lb) lb.addEventListener("click", openLostModal);
  document.querySelectorAll(".found-btn").forEach(function(btn){
    btn.addEventListener("click", function(){ openFoundModal(btn.getAttribute("data-id")); });
  });
}

function stampEl(status, justStamped){
  var label = status.toUpperCase();
  return '<span class="stamp ' + status + (justStamped ? ' stamp-in' : '') + '">' + label + '</span>';
}

function renderMyReports(){
  var mine = state.reports.filter(function(r){ return r.reporterId === state.myId; });
  var html = '<div class="section-label"><span>MY CLAIMS</span><span class="count">' + mine.length + ' filed</span></div>';
  if(mine.length === 0){
    html += '<div class="empty"><div class="icon">&#9679;</div><p>No tickets filed yet.</p></div>';
  } else {
    mine.forEach(function(r){
      var justStamped = r.status === "matched" && r._justStamped;
      html += '<div class="card ' + r.status + '">' +
        '<div class="card-cat">' + esc(r.category) + '</div>' +
        '<div class="card-desc">' + esc(r.description) + '</div>' +
        '<div class="card-meta"><span>FILED ' + timeAgo(r.createdAt) + '</span>' +
        (r.dropoffLocation ? '<span>&#8594; ' + esc(r.dropoffLocation) + '</span>' : '') + '</div>' +
        '<div class="card-actions" style="justify-content:space-between; align-items:center;">' +
        stampEl(r.status, justStamped);
      if(r.status === "matched"){
        html += '<button class="btn btn-small claim-btn" data-id="' + r.id + '">Mark as Claimed</button>';
      }
      html += '</div></div>';
    });
  }
  $("main").innerHTML = html;
  document.querySelectorAll(".claim-btn").forEach(function(btn){
    btn.addEventListener("click", function(){ markClaimed(btn.getAttribute("data-id")); });
  });
}

function renderNotifications(){
  var mine = state.reports.filter(function(r){
    return r.reporterId === state.myId && (r.status === "matched" || r.status === "claimed");
  }).sort(function(a,b){ return (b.matchedAt||0) - (a.matchedAt||0); });

  var html = '<div class="section-label"><span>ALERTS</span><span class="count">' + mine.length + '</span></div>';
  if(mine.length === 0){
    html += '<div class="empty"><div class="icon">&#9679;</div><p>No word yet. Check back later.</p></div>';
  } else {
    mine.forEach(function(r){
      var unread = !r.acknowledged;
      html += '<div class="notif' + (unread ? ' unread' : '') + '">' +
        '<div class="notif-title">Item Recovered</div>' +
        '<div class="notif-body">Your ' + esc((r.category||"").toLowerCase()) +
        ' has been found and dropped off at ' + esc(r.dropoffLocation || "—") + '.</div>' +
        '<div class="notif-time">' + timeAgo(r.matchedAt) + '</div></div>';
    });
  }
  $("main").innerHTML = html;
}

function markNotifsRead(){
  var unread = state.reports.filter(function(r){
    return r.reporterId === state.myId && r.status === "matched" && !r.acknowledged;
  });
  unread.forEach(function(r){
    updateDoc(doc(db, "reports", r.id), { acknowledged: true }).catch(function(){});
  });
}

// ---------------- lost modal ----------------
function openLostModal(){
  $("lostCategory").value = "";
  $("lostDesc").value = "";
  $("lostCatField").classList.remove("error");
  $("lostDescField").classList.remove("error");
  resetSubmitBtn($("lostSubmitBtn"), "Stamp &amp; File Ticket");
  $("lostOverlay").classList.add("show");
}
function closeLostModal(){ $("lostOverlay").classList.remove("show"); }
function resetSubmitBtn(btn, label){ btn.disabled = false; btn.innerHTML = label; }
function loadingBtn(btn){ btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Filing…'; }

function submitLost(){
  var cat = $("lostCategory").value;
  var desc = $("lostDesc").value.trim();
  var ok = true;
  if(!cat){ $("lostCatField").classList.add("error"); ok = false; } else { $("lostCatField").classList.remove("error"); }
  if(!desc){ $("lostDescField").classList.add("error"); ok = false; } else { $("lostDescField").classList.remove("error"); }
  if(!ok) return;

  var btn = $("lostSubmitBtn");
  loadingBtn(btn);
  addDoc(collection(db, "reports"), {
    category: cat, description: desc, status: "pending",
    reporterId: state.myId, reporterName: state.myName || "Anonymous",
    createdAt: Date.now()
  }).then(function(){
    resetSubmitBtn(btn, "Stamp &amp; File Ticket");
    closeLostModal();
    showToast("Ticket filed — you're on the board");
  }).catch(function(err){
    resetSubmitBtn(btn, "Stamp &amp; File Ticket");
    console.error("submitLost failed:", err);
    showToast("Error: " + err.message);
  });
}

// ---------------- found modal ----------------
function openFoundModal(reportId){
  var r = state.reports.find(function(x){ return x.id === reportId; });
  if(!r) return;
  state.foundReportId = reportId;
  $("foundPreview").innerHTML =
    '<div class="card-cat">' + esc(r.category) + '</div>' +
    '<div class="card-desc">' + esc(r.description) + '</div>';
  $("foundLoc").value = "";
  $("foundLocField").classList.remove("error");
  resetSubmitBtn($("foundSubmitBtn"), "Confirm &amp; Stamp Found");
  $("foundOverlay").classList.add("show");
}
function closeFoundModal(){ $("foundOverlay").classList.remove("show"); state.foundReportId = null; }

function submitFound(){
  var loc = $("foundLoc").value;
  if(!loc){ $("foundLocField").classList.add("error"); return; }
  $("foundLocField").classList.remove("error");
  if(!state.foundReportId) return;

  var btn = $("foundSubmitBtn");
  loadingBtn(btn);
  updateDoc(doc(db, "reports", state.foundReportId), {
    status: "matched", dropoffLocation: loc,
    finderId: state.myId, finderName: state.myName || "Anonymous",
    matchedAt: Date.now(), acknowledged: false
  }).then(function(){
    resetSubmitBtn(btn, "Confirm &amp; Stamp Found");
    closeFoundModal();
    showToast("Stamped FOUND — owner will be notified");
  }).catch(function(err){
    resetSubmitBtn(btn, "Confirm &amp; Stamp Found");
    console.error("submitFound failed:", err);
    showToast("Error: " + err.message);
  });
}

function markClaimed(reportId){
  updateDoc(doc(db, "reports", reportId), { status: "claimed" })
    .then(function(){ showToast("Marked CLAIMED — case closed"); })
    .catch(function(err){ showToast("Error: " + err.message); });
}

// ---------------- wiring ----------------
function wireStatic(){
  document.querySelectorAll(".navbtn").forEach(function(b){
    b.addEventListener("click", function(){ setView(b.getAttribute("data-view")); });
  });
  document.querySelectorAll("[data-close]").forEach(function(el){
    el.addEventListener("click", function(){ closeLostModal(); closeFoundModal(); });
  });
  $("lostOverlay").addEventListener("click", function(e){ if(e.target === this) closeLostModal(); });
  $("foundOverlay").addEventListener("click", function(e){ if(e.target === this) closeFoundModal(); });
  $("lostSubmitBtn").addEventListener("click", submitLost);
  $("foundSubmitBtn").addEventListener("click", submitFound);
}

// ---------------- init ----------------
function init(){
  wireStatic();
  initIdentity();

  var q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
  onSnapshot(q, function(snap){
    var prevMatched = {};
    state.reports.forEach(function(r){ if(r.status === "matched") prevMatched[r.id] = true; });
    state.reports = snap.docs.map(function(d){
      var data = d.data(); data.id = d.id;
      if(data.status === "matched" && !prevMatched[data.id]) data._justStamped = true;
      return data;
    });
    render();
  }, function(err){
    console.error("Firestore subscription error:", err);
    $("main").innerHTML = '<div class="banner">Sync error: ' + esc(err.message) + '</div>';
  });

  $("boot").style.display = "none";
  $("app").style.display = "flex";
  $("app").style.flexDirection = "column";
  setActiveNav();
  render();
}

init();
