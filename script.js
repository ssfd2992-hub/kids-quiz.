/* ================== script.js (موسع بالإضافات المطلوبة) ================== */

/* ================== إعدادات - غيّر القيم هنا قبل التشغيل ================== */
const USERS_BIN_ID = "68d9751a43b1c97be9533ff7"; // bin لتخزين حسابات الدخول: {username,password,role,stage}
const USERDATA_BIN_ID = "68d97a9bd0ea881f408e3674"; // bin لتخزين بيانات شخصية: {username,phone,birthdate,photo}
const USERRESULTS_BIN_ID = "68d9896bae596e708fff0a10";
// ======= جديد لا تنس تغيّره بـ Bin ID بتاعك =======
const ADMIN_CONFIG_BIN_ID = "68daf5aad0ea881f408f9ae3";
// استبدل ده بالـ Bin ID بتاع المتجر
const SHOP_BIN_ID = "68dd220dae596e708f02670c";

// bin لتخزين نتائج كل المستخدمين
const API_KEY = "$2a$10$wTX4NeG7hamsQFvPqAi37ukVtUMqnK.yKu9lCAlWXjENFkEvMsPwe";
/* ===================================================================== */

/* ---------- البيانات والحالة ---------- */
const STAGES = {
  "مرحلة اولى وتانية": { questions: "68d8c7d843b1c97be9528b6c", timer: 300 },
  "مرحلة ثالثة ورابعة": { questions: "68d988b4ae596e708fff09a1", timer: 600 },
  "مرحلة خامسة وسادسة": { questions: "68d988d343b1c97be9535046", timer: 900 },
  "مرحلة إعدادى وثانوى": { questions: "68d988f9d0ea881f408e41af", timer: 1200 },
  "مرحلة الراعى الصالح": { questions: "68d98912ae596e708fff09dc", timer: 600 }
};

let currentUser = null;
let currentUserData = null;
let currentStage = null;
let questions = [];
let currentQuestionIndex = 0;
let score = 0;
let timerInterval = null;
let remainingSeconds = 0;
let quizRunning = false;
let userAnswers = [];

/* أصوات */
const correctSound = document.getElementById("correctSound");
const wrongSound = document.getElementById("wrongSound");

/* ---------- أدوات تتبع للمطور ---------- */
function trapLog(tag, obj) {
  try {
    console.groupCollapsed(`TRACE: ${tag}`);
    console.log(obj);
    console.groupEnd();
  } catch (e) {}
}
function trapError(tag, err) {
  try {
    console.groupCollapsed(`ERROR: ${tag}`);
    console.error(err);
    console.groupEnd();
  } catch (e) {}
}

/* ---------- إخفاء / إظهار الشاشات + animation helper ---------- */
function hideAllScreens() {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
}
function animateElementOnce(el, className = "animate-in") {
  if (!el) return;
  el.classList.remove(className);
  // force reflow
  void el.offsetWidth;
  el.classList.add(className);
  function cleanup() {
    el.removeEventListener("animationend", cleanup);
    // keep class or remove for reuse? نتركها لكن يمكن إزالتها إذا أردت:
    el.classList.remove(className);
  }
  el.addEventListener("animationend", cleanup);
}

/* ---------- JSONBin helpers ---------- */
async function fetchBin(binId) {
  trapLog("fetchBin", binId);
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { "X-Master-Key": API_KEY }
    });
    const json = await res.json();
    return json.record || [];
  } catch (err) {
    trapError("fetchBin", err);
    alert("حدث خطأ أثناء جلب البيانات من JSONBin");
    return [];
  }
}
async function saveBin(binId, data) {
  trapLog("saveBin", {
    binId,
    length: Array.isArray(data) ? data.length : "obj"
  });
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": API_KEY
      },
      body: JSON.stringify(data)
    });
    return res;
  } catch (err) {
    trapError("saveBin", err);
    alert("حدث خطأ أثناء حفظ البيانات إلى JSONBin");
    throw err;
  }
}

/* ================== التسجيل / فتح شاشات (مع animation) ================== */
function openRegister() {
  hideAllScreens();
  document.getElementById("register-screen").classList.remove("hidden");
  // animate the register box
  const box = document.getElementById("register-box");
  animateElementOnce(box, "animate-in");
}
function backToLogin() {
  hideAllScreens();
  document.getElementById("auth-screen").classList.remove("hidden");
  animateElementOnce(document.getElementById("auth-box"), "animate-in");
}

/* ================= Avatar picker setup ================= */
function setupAvatarPickers() {
  // register picker
  document.querySelectorAll(".avatar-picker").forEach((wrap) => {
    wrap.querySelectorAll("img.avatar-option").forEach((img) => {
      img.addEventListener("click", (e) => {
        // clear siblings
        img.parentElement
          .querySelectorAll("img.avatar-option")
          .forEach((i) => i.classList.remove("selected"));
        img.classList.add("selected");
        // determine target hidden input or preview
        if (wrap.id === "register-avatar-picker") {
          document.getElementById("reg-avatar").value = img.dataset.url || "";
        } else if (wrap.id === "profile-avatar-picker") {
          // preview
          document.getElementById("profile-current-photo").src =
            img.dataset.url || "";
          // store selection temporarily in element dataset
          wrap.dataset.selected = img.dataset.url || "";
        }
      });
    });
  });
}

/* ================== تسجيل وإنشاء حساب ================== */
async function register() {
  const username = document.getElementById("reg-name").value.trim();
  const phone = document.getElementById("reg-phone").value.trim();
  const birth = document.getElementById("reg-birth").value;
  const photoFile = document.getElementById("reg-photo").files[0];
  const pass = document.getElementById("reg-pass").value;
  const pass2 = document.getElementById("reg-pass2").value;
  // في register() لما تنشئ حساب جديد، ضيف coins = 0

  const stage = document.getElementById("reg-stage")
    ? document.getElementById("reg-stage").value
    : "";
  const chosenAvatar = document.getElementById("reg-avatar").value || "";

  if (!username || !pass || !pass2 || !stage)
    return alert("من فضلك املأ الحقول المطلوبة (الاسم، المرحلة، كلمة السر).");
  if (pass !== pass2) return alert("كلمتا السر غير متطابقتين");

  trapLog("register_attempt", { username, stage });

  // check duplicate
  const users = await fetchBin(USERS_BIN_ID);
  if (users.find((u) => u.username === username))
    return alert("هذا الاسم مستخدم مسبقًا");

  // add to USERS bin
  users.push({ username, password: pass, role: "user", stage });
  await saveBin(USERS_BIN_ID, users);

  // prepare personal data
  // في register() لما تنشئ حساب جديد، ضيف coins = 0
  const userData = {
    username,
    phone: phone || "",
    birthdate: birth || "",
    photo: "",
    coins: 0 // ✅ بداية من 0
  };

  if (photoFile) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      userData.photo = e.target.result;
      const darr = await fetchBin(USERDATA_BIN_ID);
      darr.push(userData);
      await saveBin(USERDATA_BIN_ID, darr);
      alert("تم إنشاء الحساب بنجاح ✅");
      backToLogin();
    };
    reader.readAsDataURL(photoFile);
  } else if (chosenAvatar) {
    // use chosen avatar URL
    userData.photo = chosenAvatar;
    const darr = await fetchBin(USERDATA_BIN_ID);
    darr.push(userData);
    await saveBin(USERDATA_BIN_ID, darr);
    alert("تم إنشاء الحساب بنجاح ✅");
    backToLogin();
  } else {
    const darr = await fetchBin(USERDATA_BIN_ID);
    darr.push(userData);
    await saveBin(USERDATA_BIN_ID, darr);
    alert("تم إنشاء الحساب بنجاح ✅");
    backToLogin();
  }
}

/* ================== تسجيل الدخول ================== */
async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  if (!username || !password)
    return alert("من فضلك أدخل اسم المستخدم وكلمة السر");

  trapLog("login_attempt", { username });

  const users = await fetchBin(USERS_BIN_ID);
  const user = users.find(
    (u) => u.username === username && u.password === password
  );
  if (!user) return alert("خطأ في اسم المستخدم أو كلمة السر");

  currentUser = user;
  const userdataArr = await fetchBin(USERDATA_BIN_ID);
  currentUserData = userdataArr.find((d) => d.username === username) || {
    username,
    phone: "",
    birthdate: "",
    photo: "",
    coins: 0 // ✅ بداية من 0
  };

  trapLog("login_success", currentUser);

  // navigate by role
  if (!user) {
    alert("❌ انت لست مدرج ضمن قائمة المستخدمين");
    return;
  }

  if (user.role === "subadmin") {
    // دخول المشرف الفرعي
    hideAllScreens();
    document.getElementById("subadmin-home").classList.remove("hidden");
    document.getElementById("subadmin-stage").innerText =
      user.stage || "غير محددة";
    loadStageConfig(user.stage);
    renderSubAdminUsers();
    renderStageResults();
  } else if (user.role === "user") {
    // دخول المستخدم العادي
    hideAllScreens();
    document.getElementById("user-home").classList.remove("hidden");
    enterUserHome();
  } else if (user.role === "admin") {
    // دخول الادمن
    hideAllScreens();
    document.getElementById("admin-home").classList.remove("hidden");
    enterAdminHome();
    loadAdminStages();
    renderSubAdmins();
  } else {
    // لو الدور مش معروف
    alert("❌ انت لست مدرج ضمن قائمة المستخدمين");
  }
}

/* ================== واجهة المستخدم: home/sidebar ================== */
async function enterUserHome() {
  updateSidebar();
  await loadStageInfo(currentUser.stage);
  // compute and render badges
  renderBadges();
  // ✅ خلي الـ sidebar يظهر أول ما يخش
  const sidebar = document.getElementById("main-sidebar");
  sidebar.classList.remove("slide-in");
  void sidebar.offsetWidth; // force reflow
  sidebar.classList.add("slide-in");
}

function updateSidebar() {
  const photoEl = document.getElementById("user-photo");
  const nameEl = document.getElementById("user-name");
  photoEl.src =
    currentUserData && currentUserData.photo
      ? currentUserData.photo
      : "https://i.postimg.cc/7ZQ7m6k9/default-avatar.png";
  nameEl.innerText = currentUser.username || "مستخدم";
  document.getElementById("user-coins").innerText = `💰 ${
    currentUserData.coins || 0
  }`;
}

async function renderBadges() {
  try {
    const medals =
      currentUserData && currentUserData.medals
        ? currentUserData.medals
        : { gold: 0, silver: 0, bronze: 0 };

    const container = document.getElementById("badges");
    container.innerHTML = `
			<div class="badge-chip">🥇 <span>${medals.gold}</span></div>
			<div class="badge-chip">🥈 <span>${medals.silver}</span></div>
			<div class="badge-chip">🥉 <span>${medals.bronze}</span></div>
		`;
  } catch (err) {
    trapError("renderBadges", err);
  }
}

/* ================== فتح/حفظ صفحة الحساب ================== */
function openProfile() {
  hideAllScreens();
  document.getElementById("profile-screen").classList.remove("hidden");
  animateElementOnce(document.getElementById("profile-box"), "animate-in");

  // fill fields
  document.getElementById("profile-current-photo").src =
    currentUserData.photo || "https://i.postimg.cc/7ZQ7m6k9/default-avatar.png";
  document.getElementById("profile-phone").value = currentUserData.phone || "";
  document.getElementById("profile-birth").value =
    currentUserData.birthdate || "";
  // make profile avatar picker reflect current photo (optional)
  renderProfileAvatars();

  const pwrap = document.getElementById("profile-avatar-picker");
  if (pwrap) {
    pwrap
      .querySelectorAll("img.avatar-option")
      .forEach((img) => img.classList.remove("selected"));
    pwrap.dataset.selected = "";
    pwrap.querySelectorAll("img.avatar-option").forEach((img) => {
      if (img.dataset.url === currentUserData.photo) {
        img.classList.add("selected");
        pwrap.dataset.selected = img.dataset.url;
      }
    });
  }
}

/* save profile edits (avatar or upload) */
async function saveProfile() {
  const newPhone = document.getElementById("profile-phone").value.trim();
  const newBirth = document.getElementById("profile-birth").value;
  const newPhotoFile = document.getElementById("profile-photo").files[0];
  const pwrap = document.getElementById("profile-avatar-picker");
  const chosenAvatar =
    pwrap && pwrap.dataset && pwrap.dataset.selected
      ? pwrap.dataset.selected
      : "";

  let photoData = currentUserData.photo || "";

  if (newPhotoFile) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      photoData = e.target.result;
      await updateUserData(newPhone, newBirth, photoData);
    };
    reader.readAsDataURL(newPhotoFile);
  } else if (chosenAvatar) {
    photoData = chosenAvatar;
    await updateUserData(newPhone, newBirth, photoData);
  } else {
    await updateUserData(newPhone, newBirth, photoData);
  }
}

async function updateUserData(phone, birthdate, photo, coins) {
  const arr = await fetchBin(USERDATA_BIN_ID);
  const idx = arr.findIndex((d) => d.username === currentUser.username);
  if (idx >= 0) {
    arr[idx].phone = phone;
    arr[idx].birthdate = birthdate;
    arr[idx].photo = photo;
    // ✅ حافظ على الكوينز
    arr[idx].coins = currentUserData.coins || arr[idx].coins || 0;
  } else {
    arr.push({
      username: currentUser.username,
      phone,
      birthdate,
      photo,
      coins: currentUserData.coins || 0 // ✅ ضيف الكوينز مع المستخدم الجديد
    });
  }

  await saveBin(USERDATA_BIN_ID, arr);
  currentUserData = arr.find((d) => d.username === currentUser.username);
  updateSidebar();
  alert("✅ تم تحديث بيانات حسابك");
  backToHome();
}

/* ================== تحميل معلومات المرحلة قبل البدء ================== */
async function loadStageInfo(stageName) {
  trapLog("loadStageInfo", stageName);
  currentStage = stageName;
  document.getElementById("stage-title").innerText =
    stageName || "لم يتم تعيين مرحلة";

  const meta = STAGES[stageName];
  if (!meta) {
    document.getElementById("stage-details").innerText = "المرحلة غير معرفة";
    return;
  }

  // عدد الأسئلة من bin الخاص بالمرحلة
  const qs = await fetchBin(meta.questions);

  // جلب إعدادات المشرف الفرعي
  const configs = await fetchBin(ADMIN_CONFIG_BIN_ID);
  const cfg = configs.find((c) => c.stage === stageName) || {};

  // لو المشرف محدد وقت override نستخدمه
  const timerMinutes = cfg.timerOverride
    ? Math.round(cfg.timerOverride)
    : Math.round(meta.timer);

  document.getElementById(
    "stage-details"
  ).innerText = `عدد الأسئلة: ${qs.length} — الوقت: ${timerMinutes} ثانية`;
}

/* ================== بدء الاختبار ================== */
async function startQuiz() {
  if (!currentUser || !currentUser.stage)
    return alert("لا توجد مرحلة محددة لحسابك");
  currentStage = currentUser.stage;
  const meta = STAGES[currentStage];
  if (!meta) return alert("المرحلة غير معرفة");
  //---التحقق من attempts / schedule / timer override---
  questions = await fetchBin(meta.questions);
  if (!questions || questions.length === 0)
    return alert("لا توجد أسئلة لهذه المرحلة");
  // تحقق من قيود المشرف
  const configs = await fetchBin(ADMIN_CONFIG_BIN_ID);
  const cfg = configs.find((c) => c.stage === currentStage) || {};

  // 1) check schedule
  const now = new Date();
  if (cfg.start && new Date(cfg.start) > now)
    return alert("لم يبدأ وقت الاختبار بعد");
  if (cfg.end && new Date(cfg.end) < now) return alert("انتهى وقت الاختبار");

  // 2) attempts per day (مثال)
  if (cfg.attempts && cfg.attempts > 0) {
    const allResults = await fetchBin(USERRESULTS_BIN_ID);
    const todayCount = (allResults || []).filter(
      (r) =>
        r.username === currentUser.username &&
        r.stage === currentStage &&
        new Date(r.date).toDateString() === new Date().toDateString()
    ).length;
    if (todayCount >= cfg.attempts)
      return alert("وصلت لحد المحاولات المسموح بها اليوم");
  }

  // 3) timer override
  if (cfg.timerOverride && Number(cfg.timerOverride) > 0) {
    remainingSeconds = Number(cfg.timerOverride);
  } else {
    remainingSeconds = meta.timer;
  }
  //-------------------

  currentQuestionIndex = 0;
  score = 0;
  userAnswers = [];
  quizRunning = true;

  hideAllScreens();
  document.getElementById("quiz-screen").classList.remove("hidden");
  animateElementOnce(document.getElementById("quiz-screen"), "animate-in");
  renderQuestion();
  startTimer();

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", onBeforeUnload);
  trapLog("quiz_started", { user: currentUser.username, stage: currentStage });
}

function startTimer() {
  updateTimerUI();
  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateTimerUI();
    if (remainingSeconds <= 0) {
      endQuiz("انتهى الوقت");
    }
  }, 1000);
}
function updateTimerUI() {
  const mm = Math.floor(remainingSeconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (remainingSeconds % 60).toString().padStart(2, "0");
  document.getElementById("timer").innerText = `⏳ ${mm}:${ss}`;
}

function onVisibilityChange() {
  if (document.hidden && quizRunning) {
    trapLog("visibility_hidden", currentUser.username);
    endQuiz("غادر التبويب");
  }
}
function onBeforeUnload(e) {
  if (quizRunning) {
    trapLog("beforeunload", currentUser.username);
  }
}

/* عرض سؤال */
function renderQuestion() {
  if (currentQuestionIndex >= questions.length) {
    endQuiz("انتهت الأسئلة");
    return;
  }
  const q = questions[currentQuestionIndex];
  document.getElementById("question-text").innerText = `${
    currentQuestionIndex + 1
  }. ${q.text}`;
  const optsWrap = document.getElementById("options");
  optsWrap.innerHTML = "";
  q.options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.innerText = opt;
    btn.onclick = () => chooseOption(idx, btn, q.answer);
    optsWrap.appendChild(btn);
  });
  document.getElementById("score-counter").innerText = `النقاط: ${score}`;
}

/* اختيار إجابة */
function chooseOption(chosenIdx, btnEl, correctIdx) {
  if (!quizRunning) return;
  userAnswers.push({
    qIndex: currentQuestionIndex,
    chosen: chosenIdx,
    correct: correctIdx,
    text: questions[currentQuestionIndex].text,
    options: questions[currentQuestionIndex].options
  });

  if (chosenIdx === correctIdx) {
    btnEl.classList.add("correct");
    try {
      correctSound.currentTime = 0;
      correctSound.play();
    } catch (e) {}
    score++;

    // ✅ أضف الكود ده عشان تزود الكوينز
    currentUserData.coins = (currentUserData.coins || 0) + 5;
    updateSidebar();
  } else {
    btnEl.classList.add("wrong");
    try {
      wrongSound.currentTime = 0;
      wrongSound.play();
    } catch (e) {}
  }

  setTimeout(() => {
    currentQuestionIndex++;
    renderQuestion();
  }, 600);
}

/* ================== إنهاء الاختبار وحفظ النتيجة ================== */
async function endQuiz(reason = "انتهى") {
  if (!quizRunning) return;
  quizRunning = false;

  clearInterval(timerInterval);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("beforeunload", onBeforeUnload);

  const total = questions.length;
  const finalScore = score;
  // ✅ حفظ الكوينز بعد نهاية الكويز
  try {
    const arr = await fetchBin(USERDATA_BIN_ID);
    const idx = arr.findIndex((d) => d.username === currentUser.username);
    if (idx >= 0) {
      arr[idx].coins = currentUserData.coins || 0;
      await saveBin(USERDATA_BIN_ID, arr);
    }
  } catch (e) {
    trapError("save_coins", e);
  }

  try {
    const allResults = await fetchBin(USERRESULTS_BIN_ID);
    allResults.push({
      username: currentUser.username,
      stage: currentStage,
      date: new Date().toISOString(),
      score: finalScore,
      total,
      details: userAnswers,
      reason
    });
    await saveBin(USERRESULTS_BIN_ID, allResults);
    trapLog("saved_user_result", {
      username: currentUser.username,
      stage: currentStage,
      score: finalScore
    });
    await updateUserMedals(finalScore, total);
  } catch (err) {
    trapError("save_result", err);
  }
  // ✅ تحديث coins في JSONBin
  try {
    const arr = await fetchBin(USERDATA_BIN_ID);
    const idx = arr.findIndex((d) => d.username === currentUser.username);
    if (idx >= 0) {
      arr[idx].coins = currentUserData.coins || 0;
      await saveBin(USERDATA_BIN_ID, arr);
    }
  } catch (e) {
    console.error("coin update error", e);
  }

  showResult(finalScore, total);
}

/* عرض النتيجة ومراجعة الأخطاء */
function showResult(finalScore, total) {
  hideAllScreens();
  document.getElementById("result-screen").classList.remove("hidden");
  document.getElementById(
    "score-text"
  ).innerText = `درجتك: ${finalScore} من ${total}`;

  let badge = "🥉 برونزية";
  if (finalScore >= total * 0.8) badge = "🥇 ذهبية";
  else if (finalScore >= total * 0.5) badge = "🥈 فضية";
  document.getElementById("badge").innerText = badge;

  const wrongDiv = document.getElementById("review");
  wrongDiv.innerHTML = "";
  const wrongs = userAnswers.filter((a) => a.chosen !== a.correct);
  if (wrongs.length === 0) {
    wrongDiv.innerHTML = "<p>🎉 أحسنت! لا أخطاء.</p>";
  } else {
    wrongs.forEach((w) => {
      const block = document.createElement("div");
      block.className = "wrong-item";
      block.innerHTML = `
        <p><strong>السؤال:</strong> ${w.text}</p>
        <p><strong>إجابتك:</strong> ${
          typeof w.chosen === "number" ? w.options[w.chosen] : "لم يجب"
        }</p>
        <p><strong>الإجابة الصحيحة:</strong> ${w.options[w.correct]}</p>
      `;
      wrongDiv.appendChild(block);
    });
  }

  clearQuizState();
}

/* تنظيف حالة الاختبار */
function clearQuizState() {
  quizRunning = false;
  questions = [];
  currentQuestionIndex = 0;
  score = 0;
  userAnswers = [];
  clearInterval(timerInterval);
  timerInterval = null;
  remainingSeconds = 0;
}
/*========================================================================*/
async function updateUserMedals(finalScore, total) {
  let medal = "bronze";
  if (finalScore >= total * 0.8) medal = "gold";
  else if (finalScore >= total * 0.5) medal = "silver";

  const arr = await fetchBin(USERDATA_BIN_ID);
  const idx = arr.findIndex((d) => d.username === currentUser.username);
  if (idx >= 0) {
    if (!arr[idx].medals) {
      arr[idx].medals = { gold: 0, silver: 0, bronze: 0 };
    }
    arr[idx].medals[medal] += 1;
    await saveBin(USERDATA_BIN_ID, arr);
    currentUserData = arr[idx];
  } else {
    // لو المستخدم مش متسجل أصلاً
    const newUser = {
      username: currentUser.username,
      phone: "",
      birthdate: "",
      photo: "",

      medals: {
        gold: medal === "gold" ? 1 : 0,
        silver: medal === "silver" ? 1 : 0,
        bronze: medal === "bronze" ? 1 : 0
      }
    };
    arr.push(newUser);
    await saveBin(USERDATA_BIN_ID, arr);
    currentUserData = newUser;
  }
}

/* ================== فتح صفحة نتائجي ================== */
async function openMyResults() {
  hideAllScreens();
  document.getElementById("my-results-screen").classList.remove("hidden");
  await renderMyResultsTable();
}
async function renderMyResultsTable() {
  const tbody = document.querySelector("#myResultsTable tbody");
  tbody.innerHTML = "<tr><td colspan='2'>تحميل...</td></tr>";
  try {
    const all = await fetchBin(USERRESULTS_BIN_ID);
    const mine = (all || [])
      .filter((r) => r.username === currentUser.username)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!mine.length) {
      tbody.innerHTML = "<tr><td colspan='2'>لا توجد نتائج حتى الآن</td></tr>";
      return;
    }
    tbody.innerHTML = "";
    mine.forEach((r) => {
      const tr = document.createElement("tr");
      const d = new Date(r.date);
      tr.innerHTML = `<td style="padding:8px;border:1px solid rgba(0,0,0,0.06)">${d.toLocaleString()}</td><td style="padding:8px;border:1px solid rgba(0,0,0,0.06)">${
        r.score
      } / ${r.total} (${r.stage})</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    trapError("renderMyResultsTable", err);
    tbody.innerHTML = "<tr><td colspan='2'>حدث خطأ أثناء جلب النتائج</td></tr>";
  }
}

/* ================== الرجوع للصفحة الرئيسية ================== */
function backToHome() {
  hideAllScreens();
  document.getElementById("user-home").classList.remove("hidden");
  // animate sidebar
  const sidebar = document.getElementById("main-sidebar");
  sidebar.classList.remove("slide-in");
  void sidebar.offsetWidth;
  sidebar.classList.add("slide-in");
  if (currentUser && currentUser.stage) loadStageInfo(currentUser.stage);

  // ✅ تحديث الميداليات بمجرد الرجوع
  renderBadges();
}

/* ================================   شاشة المتجر   ============================= */
async function renderUserShop() {
  const container = document.getElementById("user-shop-items");
  if (!container) return;

  container.innerHTML = "تحميل...";

  try {
    const shop = (await fetchBin(SHOP_BIN_ID)) || [];

    if (!shop.length) {
      container.innerHTML = "<p>لا توجد عناصر في المتجر حالياً.</p>";
      return;
    }

    // جلب بيانات المستخدم
    const userDataArr = (await fetchBin(USERDATA_BIN_ID)) || [];
    const ud = userDataArr.find(
      (d) => d.username === currentUser?.username
    ) || { coins: 0, avatars: [] };

    container.innerHTML = "";
    shop.forEach((item) => {
      const owned = (ud.avatars || []).includes(item.id);
      const canBuy = (ud.coins || 0) >= (item.price || 0);

      const card = document.createElement("div");
      card.className = "shop-item";
      card.innerHTML = `
        <img src="${item.url}" alt="${item.title || item.id}">
        <div style="margin:6px 0;font-weight:700">${item.title || item.id}</div>
        <div style="margin-bottom:8px;color:${canBuy ? "#000" : "#999"}">💰 ${
        item.price || 0
      }</div>
        ${
          owned
            ? `<button disabled>✅ تم الشراء</button>`
            : `<button onclick="buyAvatar('${item.id}')">🛒 شراء</button>`
        }
      `;
      container.appendChild(card);
    });
  } catch (e) {
    console.error("renderUserShop error", e);
    container.innerHTML = "<p>حدث خطأ أثناء تحميل المتجر</p>";
  }
}

localStorage.setItem("currentUser", JSON.stringify({ username: "كرلس" }));

async function buyAvatar(id) {
  try {
    // هات بيانات المتجر
    const shop = (await fetchBin(SHOP_BIN_ID)) || [];
    const item = shop.find((i) => i.id === id);
    if (!item) return alert("❌ الأفاتار غير موجود");

    // هات بيانات المستخدمين
    let userData = (await fetchBin(USERDATA_BIN_ID)) || [];
    const udIndex = userData.findIndex(
      (x) => x.username === currentUser.username
    );
    if (udIndex === -1) return alert("❌ لم يتم العثور على المستخدم");

    let ud = userData[udIndex];

    // تأكد من الرصيد
    if ((ud.coins || 0) < item.price) return alert("❌ لا تملك كوينز كافية");

    // خصم الكوينز
    ud.coins -= item.price;

    // إضافة الأفاتار
    if (!ud.avatars) ud.avatars = [];
    if (!ud.avatars.includes(item.id)) {
      ud.avatars.push(item.id);
    }

    // حفظ التغييرات
    userData[udIndex] = ud;
    await saveBin(USERDATA_BIN_ID, userData);

    alert("✅ تم شراء الأفاتار بنجاح");
    renderUserShop();
    updateCoinsDisplay();
    renderAccountPage();
  } catch (e) {
    console.error("buyAvatar error:", e);
  }
  updateCoinsDisplay();
}

function showUserShop() {
  hideAllScreens();

  document.getElementById("user-shop-screen").classList.remove("hidden");

  renderUserShop();
}

// يعرض الأفاتارات المخزنة في USERDATA_BIN_ID داخل #profile-avatar-picker
async function renderProfileAvatars() {
  const picker = document.getElementById("profile-avatar-picker");
  if (!picker || !currentUser) return;
  picker.innerHTML = ""; // نفّض المحتوى الحالي

  try {
    // جلب بيانات المستخدم من البنز
    const userDataArr = (await fetchBin(USERDATA_BIN_ID)) || [];
    const ud = userDataArr.find((d) => d.username === currentUser.username);

    if (!ud || !Array.isArray(ud.avatars) || ud.avatars.length === 0) {
      picker.innerHTML = "<p>❌ لم تقم بشراء أي افتار بعد.</p>";
      return;
    }

    // جلب بيانات المتجر عشان نحول id -> url (fallback: لو القيمة نفسها URL نعرضها مباشرة)
    const shop = (await fetchBin(SHOP_BIN_ID)) || [];

    ud.avatars.forEach((av) => {
      let url = null;
      const item = shop.find((s) => String(s.id) === String(av));
      if (item) url = item.url;
      else if (
        typeof av === "string" &&
        (av.startsWith("http") || av.startsWith("data:"))
      )
        url = av;

      if (!url) return;

      const img = document.createElement("img");
      img.className = "avatar-option";
      img.src = url;
      img.alt = "avatar";
      img.dataset.url = url;

      // ✅ عند الضغط على الصورة: تحديث صورة البروفايل
      img.addEventListener("click", async () => {
        document.getElementById("profile-current-photo").src = url;
        currentUserData.photo = url;

        // حفظ التغيير في البنز
        const userDataArr = (await fetchBin(USERDATA_BIN_ID)) || [];
        const udIndex = userDataArr.findIndex(
          (d) => d.username === currentUser.username
        );
        if (udIndex !== -1) {
          userDataArr[udIndex].photo = url;
          await saveBin(USERDATA_BIN_ID, userDataArr);
        }
      });

      picker.appendChild(img);
    });
  } catch (err) {
    console.error("renderProfileAvatars error:", err);
    picker.innerHTML = "<p>⚠️ حدث خطأ أثناء تحميل الأفاتارات.</p>";
  }
}

function showProfileScreen() {
  hideAllScreens();
  document.getElementById("profile-screen").classList.remove("hidden");
  renderProfileScreen();
}

/* ================== تسجيل خروج ================== */
function logout() {
  currentUser = null;
  currentUserData = null;
  hideAllScreens();

  // دايمًا يرجع لتسجيل الدخول
  document.getElementById("auth-screen").classList.remove("hidden");
  function backToHome() {
    hideAllScreens();
    document.getElementById("home-screen").classList.remove("hidden");
    updateCoinsDisplay(); // ✅ عرض الرصيد الصحيح
  }
}

/* ================== init (setup avatar pickers) ================== */
document.addEventListener("DOMContentLoaded", () => {
  setupAvatarPickers();
  // animate initial auth box
  animateElementOnce(document.getElementById("auth-box"), "animate-in");
});

/* ================== المشرف الفرعى =================================================================== */

async function enterSubAdmin() {
  // إظهار الشاشة
  hideAllScreens();
  document.getElementById("subadmin-home").classList.remove("hidden");
  document.getElementById("subadmin-stage").innerText =
    currentUser.stage || "غير محددة";
  // تحميل الإعدادات / المستخدمين / النتائج للمرحلة
  await loadStageConfig(currentUser.stage);
  await renderSubAdminUsers();
  await renderStageResults();
}

//-------دوال إعدادات المرحلة (load / save)-------------------//

async function loadStageConfig(stage) {
  try {
    const configs = await fetchBin(ADMIN_CONFIG_BIN_ID);
    const cfg = configs.find((c) => c.stage === stage) || {};
    document.getElementById("cfg-attempts").value = cfg.attempts || 0;
    document.getElementById("cfg-start").value = cfg.start
      ? cfg.start.slice(0, 16)
      : "";
    document.getElementById("cfg-end").value = cfg.end
      ? cfg.end.slice(0, 16)
      : "";
    document.getElementById("cfg-timer").value = cfg.timerOverride || "";
  } catch (e) {
    trapError("loadStageConfig", e);
  }
}

async function saveStageConfig() {
  try {
    const stage = currentUser.stage;
    const configs = await fetchBin(ADMIN_CONFIG_BIN_ID);
    const idx = configs.findIndex((c) => c.stage === stage);
    const cfg = {
      stage,
      attempts: Number(document.getElementById("cfg-attempts").value || 0),
      start: document.getElementById("cfg-start").value
        ? new Date(document.getElementById("cfg-start").value).toISOString()
        : null,
      end: document.getElementById("cfg-end").value
        ? new Date(document.getElementById("cfg-end").value).toISOString()
        : null,
      timerOverride: Number(document.getElementById("cfg-timer").value) || null
    };
    if (idx >= 0) configs[idx] = cfg;
    else configs.push(cfg);
    await saveBin(ADMIN_CONFIG_BIN_ID, configs);
    alert("✅ تم حفظ إعدادات المرحلة");
  } catch (e) {
    trapError("saveStageConfig", e);
  }
}

//----------------دوال عرض واختيار المستخدمين وحذفهم (نفس المرحلة فقط)--
async function renderSubAdminUsers() {
  const container = document.getElementById("subadmin-users");
  container.innerHTML = "<h3>مستخدمو هذه المرحلة</h3><div>تحميل...</div>";
  try {
    const allUsers = await fetchBin(USERS_BIN_ID);
    const userDataArr = await fetchBin(USERDATA_BIN_ID);
    const stageUsers = allUsers.filter(
      (u) => u.stage === currentUser.stage && u.role === "user"
    );
    if (!stageUsers.length) {
      container.innerHTML =
        "<h3>مستخدمو هذه المرحلة</h3><p>لا يوجد مستخدمين في هذه المرحلة.</p>";
      return;
    }
    const list = document.createElement("div");
    stageUsers.forEach((u) => {
      const ud = userDataArr.find((d) => d.username === u.username) || {};
      const row = document.createElement("div");
      row.className = "user-row";
      row.innerHTML = `
        <div><strong>${u.username}</strong> — 💰 ${ud.coins || 0} — ${
        ud.phone || ""
      }</div>
        <div>
          <button onclick="viewUserDetails('${u.username}')">عرض</button>
          <button onclick="subadminDeleteUser('${u.username}')">حذف</button>
        </div>
      `;
      list.appendChild(row);
    });
    container.innerHTML = "<h3>مستخدمو هذه المرحلة</h3>";
    container.appendChild(list);
  } catch (e) {
    trapError("renderSubAdminUsers", e);
    container.innerHTML = "<p>حدث خطأ أثناء جلب المستخدمين</p>";
  }
}

async function subadminDeleteUser(username) {
  if (!confirm(`هل أنت متأكد أن تحذف المستخدم ${username} ؟`)) return;
  try {
    // حذف من USERS
    const users = await fetchBin(USERS_BIN_ID);
    const i = users.findIndex((u) => u.username === username);
    if (i >= 0) {
      users.splice(i, 1);
      await saveBin(USERS_BIN_ID, users);
    }
    // حذف من USERDATA
    const ud = await fetchBin(USERDATA_BIN_ID);
    const j = ud.findIndex((d) => d.username === username);
    if (j >= 0) {
      ud.splice(j, 1);
      await saveBin(USERDATA_BIN_ID, ud);
    }
    // حذف نتائج
    const results = await fetchBin(USERRESULTS_BIN_ID);
    const filtered = results.filter((r) => r.username !== username);
    await saveBin(USERRESULTS_BIN_ID, filtered);

    alert("✅ تم الحذف");
    renderSubAdminUsers();
  } catch (e) {
    trapError("subadminDeleteUser", e);
    alert("حدث خطأ أثناء الحذف");
  }
}

//------رفع ملف الأسئلة ومعالجته (JSON و TXT مثالياً — docx/pdf اختياري)-
async function uploadQuestions() {
  const f = document.getElementById("questions-file").files[0];
  const log = document.getElementById("upload-log");
  if (!f) return alert("اختر ملفاً");
  log.innerText = "⏳ جارٍ المعالجة...";

  const ext = f.name.split(".").pop().toLowerCase();
  try {
    let questions = [];
    if (ext === "json") {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      // توقع مصفوفة أسئلة أو كائن {questions: [...]}
      questions = Array.isArray(parsed) ? parsed : parsed.questions || [];
    } else {
      // نص عادي أو docx/pdf بعد تحويلهم لنص
      const text = await f.text(); // for .txt and most small docx/pdf you'll need specialized libraries
      questions = parseTextQuestions(text);
    }

    if (!questions || !questions.length) {
      log.innerText = "❌ لم يتم العثور على أسئلة صالحة في الملف";
      return;
    }
    // الآن نخزنها في bin الخاص بالمرحلة
    const meta = STAGES[currentUser.stage];
    if (!meta || !meta.questions)
      return alert("المرحلة غير معرفة أو لا تحتوي على Bin للأسئلة");

    const existing = await fetchBin(meta.questions);
    // اختر: append أو replace — هنا سنعمل append
    const merged = existing.concat(questions);
    await saveBin(meta.questions, merged);
    log.innerText = `✅ تم إضافة ${questions.length} سؤالاً إلى مرحلتك`;
  } catch (e) {
    trapError("uploadQuestions", e);
    log.innerText = "❌ حدث خطأ أثناء المعالجة: " + (e.message || e);
  }
}

/* بسيط: parser لملف نصي يعتمد على تنسيق:
Q: السؤال
A) إجابة 1
B) إجابة 2
C) إجابة 3
D) إجابة 4
Answer: B
*/
function parseTextQuestions(text) {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const out = [];
  for (const bl of blocks) {
    const lines = bl
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const qline = lines[0].replace(/^Q[:\.\s-]*/i, "").trim();
    const opts = [];
    let answerIndex = 0;
    for (let i = 1; i < lines.length; i++) {
      const mOpt = lines[i].match(/^[A-D]\)?\s*(.+)/i);
      if (mOpt) opts.push(mOpt[1].trim());
      const mAns = lines[i].match(/^(Answer|ANS|الإجابة)[:\s-]*(.+)/i);
      if (mAns) {
        const a = mAns[2].trim();
        const idx = ["A", "B", "C", "D"].indexOf(a.toUpperCase());
        if (idx >= 0) answerIndex = idx;
      }
    }
    if (opts.length)
      out.push({ text: qline, options: opts, answer: answerIndex });
  }
  return out;
}

//--عرض نتائج المرحلة و export (CSV / PDF / Word بسيط)----
async function renderStageResults() {
  const container = document.getElementById("subadmin-results");
  container.innerHTML = "<h3>نتائج المرحلة (تحميل...)</h3>";
  try {
    const all = await fetchBin(USERRESULTS_BIN_ID);
    const stageResults = (all || [])
      .filter((r) => r.stage === currentUser.stage)
      .sort((a, b) => b.score / b.total - a.score / a.total); // ترتيب من الأعلى للأقل
    if (!stageResults.length) {
      container.innerHTML = "<p>لا توجد نتائج</p>";
      return;
    }

    // جدول مبسّط
    let html = `<h3>نتائج ${currentUser.stage}</h3>
      <button onclick="exportStageCSV()">⬇️ تنزيل CSV</button>
      <button onclick="exportStagePDF()">⬇️ تنزيل PDF</button>
      <div style="margin-top:10px">`;
    stageResults.forEach((r) => {
      html += `<div class="result-row"><div><strong>${r.username}</strong> — ${
        r.score
      }/${r.total} — ${new Date(r.date).toLocaleString()}</div></div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  } catch (e) {
    trapError("renderStageResults", e);
    container.innerHTML = "<p>حدث خطأ أثناء جلب النتائج</p>";
  }
}

async function exportStageCSV() {
  const all = await fetchBin(USERRESULTS_BIN_ID);
  const stageResults = (all || [])
    .filter((r) => r.stage === currentUser.stage)
    .sort((a, b) => b.score / b.total - a.score / a.total);
  const rows = [["username", "score", "total", "date"]];
  stageResults.forEach((r) =>
    rows.push([r.username, r.score, r.total, r.date])
  );
  const csv = rows
    .map((r) =>
      r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentUser.stage}_results.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportStagePDF() {
  const all = await fetchBin(USERRESULTS_BIN_ID);
  const stageResults = (all || [])
    .filter((r) => r.stage === currentUser.stage)
    .sort((a, b) => b.score / b.total - a.score / a.total);
  if (!stageResults.length) return alert("لا توجد نتائج للتصدير");
  // simple PDF using jsPDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(`نتائج ${currentUser.stage}`, 10, 12);
  doc.setFontSize(11);
  let y = 22;
  stageResults.forEach((r, i) => {
    doc.text(
      `${i + 1}. ${r.username} — ${r.score}/${r.total} — ${new Date(
        r.date
      ).toLocaleString()}`,
      10,
      y
    );
    y += 8;
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
  });
  doc.save(`${currentUser.stage}_results.pdf`);
}
//--------------------------صفحة الادمن----------------
function enterAdminHome() {
  switchScreen("admin-home");
  renderSubadmins();
}
function showAdminSection(id) {
  // اخفي كل الأقسام
  document
    .querySelectorAll(".admin-section")
    .forEach((sec) => sec.classList.add("hidden"));

  // اعرض القسم المطلوب
  document.getElementById(id).classList.remove("hidden");

  // استدعاء التحميل المناسب
  if (id === "manage-subadmins") {
    renderSubAdmins();
  }
  if (id === "manage-stages") {
    loadAdminStages();
  }
  if (id === "manage-users") {
    fillAdminStagePicker();
  }
  if (id === "manage-shop") renderAvatars();
}

// ====== إدارة المشرفين الفرعيين ======
/* ===================== إدارة المشرفين الفرعيين (Admin) ===================== */

// اعرض كل المشرفين الفرعيين مباشرة (لا تحتاج إضافة مسبقاً)
async function renderSubAdmins() {
  const container = document.getElementById("subadmins-list");
  container.innerHTML = "جاري التحميل...";

  try {
    const users = await fetchBin(USERS_BIN_ID);
    const subs = (users || []).filter((u) => u.role === "subadmin");

    if (!subs.length) {
      container.innerHTML = "<p>لا يوجد مشرفين فرعيين حتى الآن.</p>";
      return;
    }

    const list = document.createElement("div");
    subs.forEach((s) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.padding = "8px";
      row.style.borderBottom = "1px solid rgba(0,0,0,0.08)";
      row.innerHTML = `
        <div><strong>${s.username}</strong> — مرحلة: <em>${
        s.stage || "غير محددة"
      }</em></div>
        <div>
          <button onclick="editSubadminPrompt('${s.username}')">تعديل</button>
          <button onclick="deleteSubadmin('${s.username}')">حذف</button>
        </div>
      `;
      list.appendChild(row);
    });

    container.innerHTML = "";
    container.appendChild(list);
  } catch (e) {
    trapError("renderSubAdmins", e);
    container.innerHTML = "<p>حدث خطأ أثناء جلب المشرفين</p>";
  }
}

// نستخدم فورم مبسط لإنشاء مشرف جديد
async function createSubadmin() {
  const username = document.getElementById("sub-name").value.trim();
  const password = document.getElementById("sub-pass").value;
  const stage = document.getElementById("sub-stage").value;

  if (!username || !password || !stage)
    return alert("ادخل اسم، كلمة سر واختر مرحلة");

  try {
    const users = await fetchBin(USERS_BIN_ID);
    if (users.find((u) => u.username === username)) {
      return alert("هذا الاسم مستخدم مسبقًا");
    }
    users.push({ username, password, role: "subadmin", stage });
    await saveBin(USERS_BIN_ID, users);
    alert("✅ تم إنشاء المشرف الفرعى");
    clearSubadminForm();
    renderSubAdmins();
  } catch (e) {
    trapError("createSubadmin", e);
    alert("حدث خطأ أثناء إنشاء المشرف");
  }
}

function clearSubadminForm() {
  document.getElementById("sub-name").value = "";
  document.getElementById("sub-pass").value = "";
  document.getElementById("sub-stage").value = "";
}

// تعديل: نعرض prompt لتعديل كلمة السر أو المرحلة
async function editSubadminPrompt(username) {
  const users = await fetchBin(USERS_BIN_ID);
  const idx = users.findIndex(
    (u) => u.username === username && u.role === "subadmin"
  );
  if (idx < 0) return alert("المشرف غير موجود");

  const newPass = prompt("ادخل كلمة سر جديدة (اتركها فارغة لو لا تغيير):");
  const newStage = prompt(
    "ادخل المرحلة الجديدة (مثال: مرحلة اولى وتانية) أو اترك فارغاً:"
  );

  if (!newPass && !newStage) return;

  if (newPass) users[idx].password = newPass;
  if (newStage) users[idx].stage = newStage;

  try {
    await saveBin(USERS_BIN_ID, users);
    alert("✅ تم تحديث بيانات المشرف");
    renderSubAdmins();
  } catch (e) {
    trapError("editSubadminPrompt", e);
    alert("حدث خطأ أثناء التحديث");
  }
}

async function deleteSubadmin(username) {
  if (!confirm(`هل تريد حذف المشرف الفرعى ${username} ؟`)) return;
  try {
    const users = await fetchBin(USERS_BIN_ID);
    const i = users.findIndex(
      (u) => u.username === username && u.role === "subadmin"
    );
    if (i >= 0) {
      users.splice(i, 1);
      await saveBin(USERS_BIN_ID, users);
    }
    alert("✅ تم الحذف");
    renderSubAdmins();
  } catch (e) {
    trapError("deleteSubadmin", e);
    alert("حدث خطأ أثناء الحذف");
  }
}

// ====== Admin: عرض قائمة المراحل ======
async function loadAdminStages() {
  const container = document.getElementById("admin-stage-list");
  if (!container) return;
  container.innerHTML = "تحميل...";

  try {
    const users = await fetchBin(USERS_BIN_ID);
    const results = await fetchBin(USERRESULTS_BIN_ID);
    container.innerHTML = "";

    for (const stageName of Object.keys(STAGES)) {
      const stageUsers = users.filter(
        (u) => u.role === "user" && u.stage === stageName
      );
      // أعلى نتيجة لكل مستخدم ثم متوسط أفضل نتيجة (كمثال)
      const bests = stageUsers.map((u) => {
        const r = results.filter(
          (x) => x.username === u.username && x.stage === stageName
        );
        return r.length ? Math.max(...r.map((rr) => rr.score)) : 0;
      });
      const avgBest = stageUsers.length
        ? Math.round(bests.reduce((a, b) => a + b, 0) / stageUsers.length)
        : 0;

      const btn = document.createElement("button");
      btn.textContent = `${stageName} — (${stageUsers.length} مستخدم) — متوسط أعلى: ${avgBest}`;
      btn.onclick = () => showStageUsers(stageName);
      container.appendChild(btn);
    }
  } catch (e) {
    trapError("loadAdminStages", e);
    container.innerHTML = "<p>حدث خطأ أثناء تحميل المراحل</p>";
  }
}

// ====== Admin: عرض المستخدمين في المرحلة ======
async function showStageUsers(stage) {
  const containerPanel = document.getElementById("admin-stage-users"); // افتراض HTML موجود
  const tbody = document.getElementById("stage-users-table");
  if (!tbody) return alert("عنصر الجدول غير موجود");

  try {
    const users = await fetchBin(USERS_BIN_ID);
    const userdata = await fetchBin(USERDATA_BIN_ID);
    const results = await fetchBin(USERRESULTS_BIN_ID);

    const stageUsers = users.filter(
      (u) => u.role === "user" && u.stage === stage
    );
    // sort by best score desc
    const enriched = stageUsers
      .map((u) => {
        const userRes = results.filter(
          (r) => r.username === u.username && r.stage === stage
        );
        const best = userRes.length
          ? Math.max(...userRes.map((rr) => rr.score))
          : 0;
        const ud = userdata.find((d) => d.username === u.username) || {};
        return { username: u.username, phone: ud.phone || "", best };
      })
      .sort((a, b) => b.best - a.best);

    tbody.innerHTML = "";
    enriched.forEach((u) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${u.username}</td><td>${u.phone}</td><td>${u.best}</td>`;
      tbody.appendChild(tr);
    });

    document.getElementById(
      "stage-users-title"
    ).innerText = `👥 مستخدمين ${stage}`;
    document.getElementById("admin-stage-users").classList.remove("hidden");
    document.getElementById("admin-stage-list").classList.add("hidden");
  } catch (e) {
    trapError("showStageUsers", e);
    alert("حدث خطأ أثناء إظهار مستخدمي المرحلة");
  }
}
function hideStageUsers() {
  document.getElementById("admin-stage-users").classList.add("hidden");
  document.getElementById("admin-stage-list").classList.remove("hidden");
}
/****************** Admin - manage stage settings & upload questions ******************/

// استخدم ADMIN_CONFIG_BIN_ID الذي لديك (موجود في الأعلى)
async function fillAdminStagePicker() {
  const sel = document.getElementById("admin-stage-picker");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- اختر المرحلة --</option>`;
  Object.keys(STAGES).forEach((stage) => {
    const opt = document.createElement("option");
    opt.value = stage;
    opt.textContent = stage;
    sel.appendChild(opt);
  });
}

// عندما يختار الأدمن مرحلة
async function onAdminStagePicked() {
  const stage = document.getElementById("admin-stage-picker").value;
  const panel = document.getElementById("admin-stage-settings");
  const log = document.getElementById("admin-upload-log");
  log.innerText = "";
  if (!stage) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  await loadAdminStageSettings(stage);
}

// تحميل الإعدادات من ADMIN_CONFIG_BIN_ID للبن المرتبط بالمرحلة
async function loadAdminStageSettings(stage) {
  try {
    const raw = await fetchBin(ADMIN_CONFIG_BIN_ID);
    const configs = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const cfg = configs.find((c) => c.stage === stage) || {};
    document.getElementById("admin-max-attempts").value = cfg.attempts || 0;
    // timerOverride مخزن بالثواني في الكود الحالي
    document.getElementById("admin-timer").value = cfg.timerOverride || "";
    document.getElementById("admin-start-time").value = cfg.start
      ? cfg.start.slice(0, 16)
      : "";
    document.getElementById("admin-end-time").value = cfg.end
      ? cfg.end.slice(0, 16)
      : "";
  } catch (e) {
    trapError("loadAdminStageSettings", e);
    alert("حدث خطأ أثناء تحميل إعدادات المرحلة");
  }
}

function clearAdminStageSettings() {
  document.getElementById("admin-max-attempts").value = 0;
  document.getElementById("admin-timer").value = "";
  document.getElementById("admin-start-time").value = "";
  document.getElementById("admin-end-time").value = "";
  document.getElementById("admin-upload-log").innerText = "";
}

// حفظ الإعدادات في ADMIN_CONFIG_BIN_ID
async function saveStageSettingsForAdmin() {
  const stage = document.getElementById("admin-stage-picker").value;
  if (!stage) return alert("اختر مرحلة أولاً");

  try {
    let raw = await fetchBin(ADMIN_CONFIG_BIN_ID);
    let configs = Array.isArray(raw) ? raw : raw ? [raw] : [];

    const cfg = {
      stage,
      attempts: Number(
        document.getElementById("admin-max-attempts").value || 0
      ),
      start: document.getElementById("admin-start-time").value
        ? new Date(
            document.getElementById("admin-start-time").value
          ).toISOString()
        : null,
      end: document.getElementById("admin-end-time").value
        ? new Date(
            document.getElementById("admin-end-time").value
          ).toISOString()
        : null,
      timerOverride: document.getElementById("admin-timer").value
        ? Number(document.getElementById("admin-timer").value)
        : null
    };

    const idx = configs.findIndex((c) => c.stage === stage);
    if (idx >= 0) configs[idx] = cfg;
    else configs.push(cfg);

    await saveBin(ADMIN_CONFIG_BIN_ID, configs);
    alert(
      "✅ تم حفظ إعدادات المرحلة في bin الخاص بالمشرف الفرعى (ADMIN_CONFIG_BIN_ID)"
    );
  } catch (e) {
    trapError("saveStageSettingsForAdmin", e);
    alert("❌ حدث خطأ أثناء حفظ الإعدادات");
  }
}

/* ========== رفع / استبدال أسئلة للمرحلة ========== */
/* نستخدم parseTextQuestions الموجود عندك (نفس ما تستخدمه في Subadmin) */

async function uploadQuestionsForAdmin() {
  return _processQuestionsFileForAdmin(/*replace=*/ false);
}
async function replaceQuestionsForAdmin() {
  if (!confirm("هل تريد استبدال كل أسئلة المرحلة بالملف الجديد؟")) return;
  return _processQuestionsFileForAdmin(/*replace=*/ true);
}

async function _processQuestionsFileForAdmin(replace = false) {
  const stage = document.getElementById("admin-stage-picker").value;
  const log = document.getElementById("admin-upload-log");
  if (!stage) return alert("اختر مرحلة أولاً");
  const f = document.getElementById("admin-questions-file").files[0];
  if (!f) return alert("اختر ملف أسئلة");

  log.innerText = "⏳ جاري المعالجة...";
  const ext = f.name.split(".").pop().toLowerCase();

  try {
    let newQuestions = [];
    if (ext === "json") {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      newQuestions = Array.isArray(parsed) ? parsed : parsed.questions || [];
    } else {
      // نص عادي أو docx/pdf (مبسّط: نحاول نص عادي)
      const txt = await f.text();
      newQuestions = parseTextQuestions(txt); // تستخدم parser الموجود في ملفك
    }

    if (!newQuestions.length) {
      log.innerText = "❌ لم يتم استخراج أسئلة من الملف";
      return;
    }

    const meta = STAGES[stage];
    if (!meta || !meta.questions) {
      log.innerText = "❌ هذه المرحلة ليس لها Bin أسئلة مُعَرَّف";
      return;
    }

    const qBinId = meta.questions;
    const existing = await fetchBin(qBinId);
    const existingArr = Array.isArray(existing)
      ? existing
      : existing
      ? [existing]
      : [];
    const merged = replace ? newQuestions : existingArr.concat(newQuestions);
    await saveBin(qBinId, merged);

    log.innerText = `✅ تم ${replace ? "استبدال" : "إضافة"} ${
      newQuestions.length
    } سؤال/أسئلة بنجاح`;
  } catch (e) {
    trapError("_processQuestionsFileForAdmin", e);
    log.innerText = "❌ خطأ أثناء التعامل مع الملف";
  }
}

/* call fillAdminStagePicker when admin manage-users section is shown or on startup */

// تحميل الأفاتارات
async function renderAvatars() {
  const container = document.getElementById("avatar-list");
  container.innerHTML = "تحميل...";
  try {
    const shop = (await fetchBin(SHOP_BIN_ID)) || [];
    if (!shop.length) {
      container.innerHTML = "<p>لا توجد صور في المتجر بعد.</p>";
      return;
    }

    container.innerHTML = "";
    shop.forEach((item) => {
      const div = document.createElement("div");
      div.className = "shop-item";
      div.innerHTML = `
        <img src="${item.url}" width="80" height="80" style="border-radius:8px;">
        <span>💰 ${item.price} نقطة</span>
        <button onclick="deleteAvatar('${item.id}')">حذف</button>
      `;
      container.appendChild(div);
    });
  } catch (e) {
    console.error("renderAvatars error:", e);
    container.innerHTML = "خطأ في تحميل المتجر";
  }
}

// إضافة أفاتار جديد
async function addAvatar() {
  const url = document.getElementById("avatar-url").value.trim();
  const price = parseInt(document.getElementById("avatar-price").value.trim());
  if (!url || !price) return alert("ادخل رابط وسعر");

  try {
    const shop = (await fetchBin(SHOP_BIN_ID)) || [];
    const id = Date.now().toString();
    shop.push({ id, url, price });
    await saveBin(SHOP_BIN_ID, shop);
    alert("✅ تم إضافة الأفاتار");
    document.getElementById("avatar-url").value = "";
    document.getElementById("avatar-price").value = "";
    renderAvatars();
  } catch (e) {
    console.error("addAvatar error:", e);
    alert("خطأ أثناء الإضافة");
  }
}

// حذف أفاتار
async function deleteAvatar(id) {
  if (!confirm("هل أنت متأكد من الحذف؟")) return;
  try {
    let shop = (await fetchBin(SHOP_BIN_ID)) || [];
    shop = shop.filter((i) => i.id !== id);
    await saveBin(SHOP_BIN_ID, shop);
    renderAvatars();
  } catch (e) {
    console.error("deleteAvatar error:", e);
    alert("خطأ أثناء الحذف");
  }
}
async function updateCoinsDisplay() {
  if (!currentUser) return;

  try {
    const userDataArr = (await fetchBin(USERDATA_BIN_ID)) || [];
    const ud = userDataArr.find((u) => u.username === currentUser.username);

    if (ud) {
      currentUserData = ud; // ✅ تحديث النسخة
      const coinsEl = document.getElementById("user-coins");
      if (coinsEl) coinsEl.innerText = `💰 ${ud.coins || 0}`;
    } else {
      console.warn("⚠️ المستخدم مش متسجل في USERDATA_BIN_ID");
    }
  } catch (e) {
    console.error("updateCoinsDisplay error:", e);
  }
}