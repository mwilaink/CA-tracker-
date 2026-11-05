const STORAGE_KEY = "caTrackerData_v1";
const TERM_WEIGHTS = {
  1: { test: 8, assignment: 2, total: 10 },
  2: { test: 10, assignment: 4, total: 14 },
  3: { test: 12, assignment: 4, total: 16 }
};
const CA_PASS_TARGET = 20;
let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.courses) && Array.isArray(saved.records)) return saved;
  } catch (error) { console.warn("Could not load saved data", error); }
  return { courses: [], records: [] };
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]));
}
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}
function showPage(page) {
  document.querySelectorAll(".page").forEach(section => section.classList.toggle("active", section.id === `page-${page}`));
  document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  if (page === "upload") populateCourseSelect();
  if (page === "dashboard" || page === "check") renderProgress();
  if (page === "courses") renderCourses();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.addEventListener("click", event => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) { event.preventDefault(); showPage(pageButton.dataset.page); }
});

function roundMark(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function validPercent(value) { return value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100; }
function calculateTerm(record) {
  const weight = TERM_WEIGHTS[record.term];
  return roundMark(Number(record.testPercent) / 100 * weight.test +
                   Number(record.assignmentPercent) / 100 * weight.assignment);
}
function getCourseSummary(courseId) {
  const records = state.records.filter(record => record.courseId === courseId);
  let earned = 0, completedWeight = 0, completedTerms = 0;
  const terms = {};
  for (let term = 1; term <= 3; term++) {
    const record = records.find(item => Number(item.term) === term);
    if (record) {
      terms[term] = record;
      earned += calculateTerm(record);
      completedWeight += TERM_WEIGHTS[term].total;
      completedTerms++;
    }
  }
  earned = roundMark(earned);
  const remaining = roundMark(40 - completedWeight);
  const required = roundMark(Math.max(0, CA_PASS_TARGET - earned));
  const term3Needed = roundMark(Math.max(0, CA_PASS_TARGET - earned));
  const isTerm2Complete = Boolean(terms[1] && terms[2]);
  let color = "blue", status = "In progress";
  if (isTerm2Complete) {
    if (earned >= CA_PASS_TARGET) { color = "green"; status = "On target"; }
    else { color = "red"; status = "Below target"; }
  }
  if (completedTerms === 3) {
    if (earned >= CA_PASS_TARGET) { color = "green"; status = "Pass target reached"; }
    else { color = "red"; status = "Below pass target"; }
  }
  return { earned, completedWeight, remaining, completedTerms, terms, required, term3Needed, isTerm2Complete, color, status };
}
function populateCourseSelect(selectedId = "") {
  const select = document.getElementById("courseSelect");
  select.innerHTML = '<option value="">Select a course</option>' + state.courses.map(course =>
    `<option value="${course.id}" ${course.id === selectedId ? "selected" : ""}>${escapeHTML(course.name)}</option>`).join("");
}
function updateWeightInfo() {
  const term = Number(document.getElementById("termSelect").value);
  const weight = TERM_WEIGHTS[term];
  document.getElementById("weightInfo").textContent = `Test: ${weight.test} marks · Assignment: ${weight.assignment} marks · Total: ${weight.total} marks`;
  updatePreview();
}
function updatePreview() {
  const term = Number(document.getElementById("termSelect").value);
  const test = document.getElementById("testPercent").value;
  const assignment = document.getElementById("assignmentPercent").value;
  const preview = document.getElementById("calculationPreview");
  if (!validPercent(test) || !validPercent(assignment)) {
    preview.innerHTML = "<span>Weighted CA preview</span><strong>Enter both percentages</strong><small>Use values between 0 and 100.</small>";
    return;
  }
  const weight = TERM_WEIGHTS[term];
  const testMark = roundMark(Number(test) / 100 * weight.test);
  const assignmentMark = roundMark(Number(assignment) / 100 * weight.assignment);
  const total = roundMark(testMark + assignmentMark);
  preview.innerHTML = `<span>Weighted CA preview</span><strong>${total} / ${weight.total} marks</strong><small>Test: ${testMark}/${weight.test} · Assignment: ${assignmentMark}/${weight.assignment}</small>`;
}
document.getElementById("termSelect").addEventListener("change", updateWeightInfo);
document.getElementById("testPercent").addEventListener("input", updatePreview);
document.getElementById("assignmentPercent").addEventListener("input", updatePreview);

document.getElementById("courseForm").addEventListener("submit", event => {
  event.preventDefault();
  const input = document.getElementById("newCourse");
  const name = input.value.trim();
  if (!name) return;
  if (state.courses.some(course => course.name.toLowerCase() === name.toLowerCase())) {
    showToast("That course already exists.");
    return;
  }
  state.courses.push({ id: crypto.randomUUID(), name });
  saveState();
  input.value = "";
  renderCourses();
  populateCourseSelect();
  updateDashboardStats();
  showToast("Course added.");
});

document.getElementById("caForm").addEventListener("submit", event => {
  event.preventDefault();
  const courseId = document.getElementById("courseSelect").value;
  const term = Number(document.getElementById("termSelect").value);
  const testPercent = document.getElementById("testPercent").value;
  const assignmentPercent = document.getElementById("assignmentPercent").value;
  const editId = document.getElementById("editId").value;
  if (!courseId) { showToast("Please select a course."); return; }
  if (!validPercent(testPercent) || !validPercent(assignmentPercent)) {
    showToast("Enter both percentages between 0 and 100."); return;
  }
  const existing = state.records.find(record => record.id === editId);
  const duplicate = state.records.find(record => record.courseId === courseId && Number(record.term) === term && record.id !== editId);
  if (duplicate) {
    showToast("This course already has marks for that term. Edit the existing entry instead."); return;
  }
  const record = { id: editId || crypto.randomUUID(), courseId, term, testPercent: Number(testPercent), assignmentPercent: Number(assignmentPercent) };
  if (existing) state.records[state.records.findIndex(item => item.id === editId)] = record;
  else state.records.push(record);
  saveState();
  resetForm();
  renderProgress();
  updateDashboardStats();
  showToast(existing ? "CA entry updated." : "CA marks saved.");
  showPage("check");
});
function resetForm() {
  document.getElementById("caForm").reset();
  document.getElementById("editId").value = "";
  document.getElementById("saveBtn").textContent = "Save CA marks";
  updateWeightInfo();
}
function editRecord(id) {
  const record = state.records.find(item => item.id === id);
  if (!record) return;
  document.getElementById("editId").value = record.id;
  populateCourseSelect(record.courseId);
  document.getElementById("termSelect").value = String(record.term);
  document.getElementById("testPercent").value = record.testPercent;
  document.getElementById("assignmentPercent").value = record.assignmentPercent;
  document.getElementById("saveBtn").textContent = "Update CA marks";
  updateWeightInfo();
  showPage("upload");
}
function deleteRecord(id) {
  if (!confirm("Delete this CA entry? This cannot be undone.")) return;
  state.records = state.records.filter(record => record.id !== id);
  saveState(); renderProgress(); updateDashboardStats(); showToast("CA entry deleted.");
}
function deleteCourse(id) {
  const course = state.courses.find(item => item.id === id);
  if (!course) return;
  if (!confirm(`Delete "${course.name}" and all its CA records?`)) return;
  state.courses = state.courses.filter(item => item.id !== id);
  state.records = state.records.filter(record => record.courseId !== id);
  saveState(); renderCourses(); renderProgress(); populateCourseSelect(); updateDashboardStats(); showToast("Course deleted.");
}
function courseCard(course, detailed = false) {
  const summary = getCourseSummary(course.id);
  const percentage = Math.min(100, summary.earned / 40 * 100);
  const termText = [1,2,3].map(term => {
    const record = summary.terms[term];
    return `T${term}: ${record ? `${calculateTerm(record)}/${TERM_WEIGHTS[term].total}` : "—"}`;
  }).join(" · ");
  const term3Record = summary.terms[3];
  let targetText = "";
  if (!summary.terms[3]) {
    targetText = summary.earned >= 20 ? "You've reached 20 marks already." :
      `Need ${summary.required} more marks to reach 20/40${summary.remaining >= summary.required ? ` · ${summary.remaining} marks still available` : " · Target is no longer reachable"}.`;
  } else {
    targetText = summary.earned >= 20 ? "You've reached the 20-mark target." : `You are ${roundMark(20-summary.earned)} marks below the target.`;
  }
  const recordButtons = state.records.filter(record => record.courseId === course.id).map(record =>
    `<button class="small-btn" data-edit="${record.id}">Edit T${record.term}</button><button class="small-btn" data-delete-record="${record.id}">Delete T${record.term}</button>`).join("");
  return `<article class="course-card">
    <div class="course-card-top"><div><h3>${escapeHTML(course.name)}</h3><div class="course-meta">${summary.completedTerms}/3 terms entered · ${summary.completedWeight}/40 assessment marks recorded</div></div><div class="score">${summary.earned}<small> / 40</small></div></div>
    <div class="progress-track"><div class="progress-fill ${summary.color}" style="width:${percentage}%"></div></div>
    <div class="progress-details"><span>${termText}</span><span class="status ${summary.color}">${summary.status}</span></div>
    ${detailed ? `<div class="course-meta" style="margin-top:13px;line-height:1.6">${targetText}</div><div class="course-actions">${recordButtons}<button class="small-btn" data-add-course-record="${course.id}">＋ Add / update CA</button></div>` : ""}
  </article>`;
}
function renderProgress() {
  const dashboard = document.getElementById("dashboardCourses");
  const check = document.getElementById("checkCourses");
  const dashboardEmpty = document.getElementById("dashboardEmpty");
  const checkEmpty = document.getElementById("checkEmpty");
  dashboard.innerHTML = state.courses.map(course => courseCard(course, false)).join("");
  check.innerHTML = state.courses.map(course => courseCard(course, true)).join("");
  dashboardEmpty.hidden = state.courses.length > 0;
  checkEmpty.hidden = state.courses.length > 0;
  updateDashboardStats();
}
function updateDashboardStats() {
  const count = state.courses.length;
  const summaries = state.courses.map(course => getCourseSummary(course.id));
  const total = summaries.reduce((sum, summary) => sum + summary.earned, 0);
  const targetCount = summaries.filter(summary => summary.earned >= 20 && summary.completedTerms >= 2).length;
  document.getElementById("statCourses").textContent = count;
  document.getElementById("statAverage").textContent = count ? `${roundMark(total/count).toFixed(1)}/40` : "—";
  document.getElementById("statAverageSub").textContent = count ? "Average CA per course" : "Across entered courses";
  document.getElementById("statTarget").textContent = targetCount;
}
function renderCourses() {
  const list = document.getElementById("courseManagement");
  list.innerHTML = state.courses.map(course => {
    const count = state.records.filter(record => record.courseId === course.id).length;
    return `<div class="managed-course"><div><strong>${escapeHTML(course.name)}</strong><small>${count} of 3 term entries recorded</small></div><button class="small-btn" data-delete-course="${course.id}">Delete course</button></div>`;
  }).join("");
  document.getElementById("coursesEmpty").hidden = state.courses.length > 0;
}
document.addEventListener("click", event => {
  const edit = event.target.closest("[data-edit]");
  const delRecord = event.target.closest("[data-delete-record]");
  const delCourse = event.target.closest("[data-delete-course]");
  const addRecord = event.target.closest("[data-add-course-record]");
  if (edit) editRecord(edit.dataset.edit);
  if (delRecord) deleteRecord(delRecord.dataset.deleteRecord);
  if (delCourse) deleteCourse(delCourse.dataset.deleteCourse);
  if (addRecord) {
    resetForm(); populateCourseSelect(addRecord.dataset.addCourseRecord); showPage("upload");
  }
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "ca-tracker-backup.json"; a.click();
  URL.revokeObjectURL(url); showToast("Backup exported.");
});
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
document.getElementById("importFile").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.courses) || !Array.isArray(imported.records)) throw new Error("Invalid backup");
    const validCourseIds = new Set(imported.courses.map(course => course.id));
    const validRecords = imported.records.every(record => validCourseIds.has(record.courseId) && TERM_WEIGHTS[record.term] && validPercent(String(record.testPercent)) && validPercent(String(record.assignmentPercent)));
    if (!validRecords) throw new Error("Invalid records");
    if (!confirm("Importing this backup will replace your current CA Tracker data. Continue?")) return;
    state = imported; saveState(); renderCourses(); renderProgress(); populateCourseSelect(); showToast("Backup imported successfully.");
  } catch (error) { showToast("Could not import this backup file."); }
  event.target.value = "";
});

populateCourseSelect();
updateWeightInfo();
renderCourses();
renderProgress();
