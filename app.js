/* CBC Competency Tracker - offline IndexedDB application */
const DB_NAME = 'cbcTrackerDB';
const DB_VERSION = 1;
const STORES = ['learners', 'attendance', 'assessments', 'settings'];
const RUBRIC_LEVELS = ['Emerging', 'Developing', 'Proficient', 'Mastered'];
const AUTH = { username: 'admin', password: 'CBC2026', sessionKey: 'cbcLoggedIn' };

let db;
let loadedAssessmentRecords = [];

const $ = (id) => document.getElementById(id);
const today = new Date().toISOString().split('T')[0];

async function init() {
  requireAuthentication();

  db = await openDatabase();
  await seedSampleDataIfEmpty();
  bindAuthModule();
  bindNavigation();
  bindLearnerModule();
  bindAttendanceModule();
  bindAssessmentModule();
  bindReportModule();
  bindBackupModule();

  $('attendanceDate').value = today;
  $('assessmentDate').value = today;

  await refreshLearnerTable();
  await refreshReportLearnerOptions();
  await refreshDashboard();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains('learners')) {
        database.createObjectStore('learners', { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains('attendance')) {
        database.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains('assessments')) {
        database.createObjectStore('assessments', { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function storeAdd(storeName, data) {
  return promisifyRequest(tx(storeName, 'readwrite').add(data));
}
function storePut(storeName, data) {
  return promisifyRequest(tx(storeName, 'readwrite').put(data));
}
function storeDelete(storeName, id) {
  return promisifyRequest(tx(storeName, 'readwrite').delete(id));
}
function storeGetAll(storeName) {
  return promisifyRequest(tx(storeName).getAll());
}
function storeGet(storeName, id) {
  return promisifyRequest(tx(storeName).get(id));
}
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function bindAuthModule() {
  $('logoutBtn').addEventListener('click', logout);
}

function logout() {
  localStorage.removeItem(AUTH.sessionKey);
  window.location.href = 'login.html';
}

function isAuthenticated() {
  return localStorage.getItem(AUTH.sessionKey) === 'true';
}

function requireAuthentication() {
  if (isAuthenticated()) return;
  window.location.href = 'login.html';
}

async function seedSampleDataIfEmpty() {
  const existing = await storeGet('settings', 'seeded');
  if (existing?.value) return;

  const learners = [
    { admissionNumber: 'JSS001', fullName: 'Amina Wanjiku', dob: '2010-05-02', gender: 'Female', grade: 'Grade 8', stream: 'North', guardianPhone: '0712000001', guardianEmail: 'guardian1@example.com', notes: 'Shows strong collaboration and communication.', consent: true },
    { admissionNumber: 'JSS002', fullName: 'Brian Otieno', dob: '2010-08-14', gender: 'Male', grade: 'Grade 8', stream: 'North', guardianPhone: '0712000002', guardianEmail: 'guardian2@example.com', notes: 'Needs extra scaffolding in reasoning steps.', consent: true },
    { admissionNumber: 'JSS003', fullName: 'Cynthia Naliaka', dob: '2011-03-23', gender: 'Female', grade: 'Grade 7', stream: 'East', guardianPhone: '0712000003', guardianEmail: 'guardian3@example.com', notes: 'Excellent creativity and self-direction.', consent: true }
  ];
  for (const learner of learners) await storeAdd('learners', learner);

  const learnerList = await storeGetAll('learners');
  for (const learner of learnerList) {
    await storeAdd('attendance', {
      date: today,
      grade: learner.grade,
      stream: learner.stream,
      learnerId: learner.id,
      status: learner.fullName.includes('Brian') ? 'Late' : 'Present'
    });
  }

  await storeAdd('assessments', {
    title: 'Term 1 Problem Solving Check',
    learningArea: 'Mathematics',
    grade: 'Grade 8',
    stream: 'North',
    date: today,
    competencyItems: ['Problem solving', 'Critical thinking', 'Communication'],
    entries: learnerList
      .filter((l) => l.grade === 'Grade 8' && l.stream === 'North')
      .map((l, i) => ({
        learnerId: l.id,
        levels: {
          'Problem solving': i === 0 ? 'Proficient' : 'Developing',
          'Critical thinking': i === 0 ? 'Proficient' : 'Emerging',
          'Communication': i === 0 ? 'Mastered' : 'Developing'
        },
        evidence: i === 0 ? 'Solved 4/5 tasks independently and explained strategy.' : 'Needs guidance in step-by-step reasoning.'
      }))
  });

  await storePut('settings', { key: 'seeded', value: true });
}

function bindNavigation() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.nav-btn').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.target).classList.add('active');

      if (btn.dataset.target === 'dashboard') await refreshDashboard();
      if (btn.dataset.target === 'reports') await refreshReportLearnerOptions();
    });
  });
}

function bindLearnerModule() {
  $('learnerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('learnerId').value;
    const payload = {
      admissionNumber: $('admissionNumber').value.trim(),
      fullName: $('fullName').value.trim(),
      dob: $('dob').value,
      gender: $('gender').value,
      grade: $('grade').value.trim(),
      stream: $('stream').value.trim(),
      guardianPhone: $('guardianPhone').value.trim(),
      guardianEmail: $('guardianEmail').value.trim(),
      notes: $('notes').value.trim(),
      consent: $('consent').checked
    };

    if (id) {
      payload.id = Number(id);
      await storePut('learners', payload);
    } else {
      await storeAdd('learners', payload);
    }
    resetLearnerForm();
    await refreshLearnerTable();
    await refreshReportLearnerOptions();
    await refreshDashboard();
  });

  $('resetLearnerForm').addEventListener('click', resetLearnerForm);
  ['learnerSearch', 'filterGrade', 'filterStream'].forEach((id) => {
    $(id).addEventListener('input', refreshLearnerTable);
  });
}

function resetLearnerForm() {
  $('learnerForm').reset();
  $('learnerId').value = '';
}

async function refreshLearnerTable() {
  const learners = await storeGetAll('learners');
  const query = $('learnerSearch').value.trim().toLowerCase();
  const gradeFilter = $('filterGrade').value.trim().toLowerCase();
  const streamFilter = $('filterStream').value.trim().toLowerCase();

  const filtered = learners.filter((learner) => {
    const matchQuery =
      !query ||
      learner.fullName.toLowerCase().includes(query) ||
      learner.admissionNumber.toLowerCase().includes(query);
    const matchGrade = !gradeFilter || learner.grade.toLowerCase().includes(gradeFilter);
    const matchStream = !streamFilter || learner.stream.toLowerCase().includes(streamFilter);
    return matchQuery && matchGrade && matchStream;
  });

  const tbody = $('learnersTable').querySelector('tbody');
  tbody.innerHTML = '';
  for (const learner of filtered) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(learner.admissionNumber)}</td>
      <td>${escapeHtml(learner.fullName)}</td>
      <td>${escapeHtml(learner.grade || '-')}</td>
      <td>${escapeHtml(learner.stream || '-')}</td>
      <td>${escapeHtml(learner.guardianPhone || '-')}</td>
      <td>
        <button data-edit="${learner.id}" class="mini">Edit</button>
        <button data-delete="${learner.id}" class="mini secondary">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => populateLearnerForm(Number(btn.dataset.edit)));
  });
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (confirm('Delete this learner record?')) {
        await storeDelete('learners', Number(btn.dataset.delete));
        await refreshLearnerTable();
        await refreshReportLearnerOptions();
        await refreshDashboard();
      }
    });
  });
}

async function populateLearnerForm(id) {
  const learner = await storeGet('learners', id);
  if (!learner) return;
  $('learnerId').value = learner.id;
  $('admissionNumber').value = learner.admissionNumber || '';
  $('fullName').value = learner.fullName || '';
  $('dob').value = learner.dob || '';
  $('gender').value = learner.gender || 'Female';
  $('grade').value = learner.grade || '';
  $('stream').value = learner.stream || '';
  $('guardianPhone').value = learner.guardianPhone || '';
  $('guardianEmail').value = learner.guardianEmail || '';
  $('notes').value = learner.notes || '';
  $('consent').checked = Boolean(learner.consent);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindAttendanceModule() {
  $('loadAttendanceGrid').addEventListener('click', loadAttendanceGrid);
  $('saveAttendance').addEventListener('click', saveAttendance);
  $('exportAttendance').addEventListener('click', exportAttendanceCsv);
}

async function loadAttendanceGrid() {
  const grade = $('attendanceGrade').value.trim();
  const stream = $('attendanceStream').value.trim();
  const date = $('attendanceDate').value;
  if (!grade || !stream || !date) return alert('Enter date, grade and stream first.');

  const learners = (await storeGetAll('learners')).filter((l) => l.grade === grade && l.stream === stream);
  const existing = await storeGetAll('attendance');

  const tbody = $('attendanceTable').querySelector('tbody');
  tbody.innerHTML = '';
  for (const learner of learners) {
    const found = existing.find((a) => a.learnerId === learner.id && a.date === date && a.grade === grade && a.stream === stream);
    const tr = document.createElement('tr');
    const selectOptions = ['Present', 'Absent', 'Late']
      .map((status) => `<option value="${status}" ${found?.status === status ? 'selected' : ''}>${status}</option>`)
      .join('');
    tr.innerHTML = `<td>${escapeHtml(learner.fullName)}</td><td>${escapeHtml(learner.admissionNumber)}</td><td><select data-learner="${learner.id}">${selectOptions}</select></td>`;
    tbody.appendChild(tr);
  }
}

async function saveAttendance() {
  const date = $('attendanceDate').value;
  const grade = $('attendanceGrade').value.trim();
  const stream = $('attendanceStream').value.trim();
  const rows = $('attendanceTable').querySelectorAll('tbody tr');
  if (!rows.length) return alert('Load the class list first.');

  const currentAttendance = await storeGetAll('attendance');
  for (const row of rows) {
    const select = row.querySelector('select');
    const learnerId = Number(select.dataset.learner);
    const status = select.value;
    const existing = currentAttendance.find((a) => a.learnerId === learnerId && a.date === date && a.grade === grade && a.stream === stream);
    if (existing) {
      existing.status = status;
      await storePut('attendance', existing);
    } else {
      await storeAdd('attendance', { date, grade, stream, learnerId, status });
    }
  }
  alert('Attendance saved.');
  await refreshDashboard();
}

async function exportAttendanceCsv() {
  const attendance = await storeGetAll('attendance');
  const learners = await storeGetAll('learners');
  const rows = attendance.map((a) => {
    const learner = learners.find((l) => l.id === a.learnerId);
    return {
      date: a.date,
      grade: a.grade,
      stream: a.stream,
      admissionNumber: learner?.admissionNumber || '',
      fullName: learner?.fullName || '',
      status: a.status
    };
  });
  downloadCsv('attendance_export.csv', rows);
}

function bindAssessmentModule() {
  $('loadAssessmentGrid').addEventListener('click', loadAssessmentGrid);
  $('saveAssessment').addEventListener('click', saveAssessmentEvent);
  $('exportAssessmentCsv').addEventListener('click', () => exportAssessment('csv'));
  $('exportAssessmentJson').addEventListener('click', () => exportAssessment('json'));
}

async function loadAssessmentGrid() {
  const grade = $('assessmentGrade').value.trim();
  const stream = $('assessmentStream').value.trim();
  const competencyItems = $('competencyItems').value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!grade || !stream || competencyItems.length === 0) return alert('Fill assessment details first.');

  const learners = (await storeGetAll('learners')).filter((l) => l.grade === grade && l.stream === stream);
  const thead = $('assessmentTable').querySelector('thead');
  const tbody = $('assessmentTable').querySelector('tbody');

  thead.innerHTML = `<tr><th>Learner</th><th>Admission No</th>${competencyItems.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}<th>Evidence/Observation</th></tr>`;
  tbody.innerHTML = '';

  learners.forEach((learner) => {
    const tr = document.createElement('tr');
    tr.dataset.learner = learner.id;
    const competencyCells = competencyItems
      .map((comp) => `<td><select data-competency="${escapeHtml(comp)}">${RUBRIC_LEVELS.map((lv) => `<option value="${lv}">${lv}</option>`).join('')}</select></td>`)
      .join('');
    tr.innerHTML = `<td>${escapeHtml(learner.fullName)}</td><td>${escapeHtml(learner.admissionNumber)}</td>${competencyCells}<td><textarea data-evidence rows="2" placeholder="Observation evidence"></textarea></td>`;
    tbody.appendChild(tr);
  });
}

async function saveAssessmentEvent() {
  const title = $('assessmentTitle').value.trim();
  const learningArea = $('learningArea').value.trim();
  const grade = $('assessmentGrade').value.trim();
  const stream = $('assessmentStream').value.trim();
  const date = $('assessmentDate').value;
  const competencyItems = $('competencyItems').value.split(',').map((item) => item.trim()).filter(Boolean);
  const rows = Array.from($('assessmentTable').querySelectorAll('tbody tr'));
  if (!title || !learningArea || !grade || !date || !competencyItems.length || !rows.length) {
    return alert('Fill assessment details and load the learner grid first.');
  }

  const entries = rows.map((row) => {
    const learnerId = Number(row.dataset.learner);
    const levels = {};
    row.querySelectorAll('select[data-competency]').forEach((sel) => {
      levels[sel.dataset.competency] = sel.value;
    });
    const evidence = row.querySelector('textarea[data-evidence]').value.trim();
    return { learnerId, levels, evidence };
  });

  const event = { title, learningArea, grade, stream, date, competencyItems, entries };
  await storeAdd('assessments', event);
  loadedAssessmentRecords = [event];
  alert('Assessment event saved.');
  await refreshDashboard();
}

async function exportAssessment(format) {
  const assessments = await storeGetAll('assessments');
  if (!assessments.length) return alert('No assessments available.');
  const latest = assessments.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  loadedAssessmentRecords = [latest];

  if (format === 'json') {
    downloadJson('assessment_export.json', latest);
    return;
  }

  const learners = await storeGetAll('learners');
  const rows = latest.entries.map((entry) => {
    const learner = learners.find((l) => l.id === entry.learnerId);
    return {
      assessmentTitle: latest.title,
      learningArea: latest.learningArea,
      grade: latest.grade,
      stream: latest.stream,
      date: latest.date,
      admissionNumber: learner?.admissionNumber || '',
      fullName: learner?.fullName || '',
      ...entry.levels,
      evidence: entry.evidence
    };
  });
  downloadCsv('assessment_export.csv', rows);
}

function bindReportModule() {
  $('generateReport').addEventListener('click', generateLearnerReport);
  $('printReport').addEventListener('click', () => window.print());
}

async function refreshReportLearnerOptions() {
  const learners = await storeGetAll('learners');
  const select = $('reportLearnerSelect');
  select.innerHTML = learners.map((l) => `<option value="${l.id}">${escapeHtml(l.fullName)} (${escapeHtml(l.admissionNumber)})</option>`).join('');
}

async function generateLearnerReport() {
  const learnerId = Number($('reportLearnerSelect').value);
  if (!learnerId) return;

  const learner = await storeGet('learners', learnerId);
  const attendance = (await storeGetAll('attendance')).filter((a) => a.learnerId === learnerId);
  const assessments = await storeGetAll('assessments');
  const comment = $('reportComment').value.trim();

  const attendancePct = calculateAttendancePercentage(attendance);
  const learningAreaSummary = {};

  assessments.forEach((event) => {
    const entry = event.entries.find((e) => e.learnerId === learnerId);
    if (!entry) return;
    if (!learningAreaSummary[event.learningArea]) learningAreaSummary[event.learningArea] = [];
    Object.entries(entry.levels).forEach(([competency, level]) => {
      learningAreaSummary[event.learningArea].push({ competency, level, date: event.date, evidence: entry.evidence });
    });
  });

  const reportHtml = `
    <h3>CBC Competency Progress Report</h3>
    <p><strong>Learner:</strong> ${escapeHtml(learner.fullName)} (${escapeHtml(learner.admissionNumber)})</p>
    <p><strong>Class/Stream:</strong> ${escapeHtml(learner.grade)} - ${escapeHtml(learner.stream)}</p>
    <div class="report-grid">
      <section>
        <h4>Attendance Summary</h4>
        <p>Attendance Rate: <strong>${attendancePct.toFixed(1)}%</strong></p>
        <p>Total Records: ${attendance.length}</p>
      </section>
      <section>
        <h4>Competency Mastery by Learning Area</h4>
        ${Object.keys(learningAreaSummary).length === 0 ? '<p>No competency records yet.</p>' : Object.entries(learningAreaSummary).map(([area, records]) => `
          <h5>${escapeHtml(area)}</h5>
          <ul>
            ${records.map((r) => `<li><strong>${escapeHtml(r.competency)}:</strong> <span class="${levelClass(r.level)} level-pill">${escapeHtml(r.level)}</span> <em>(${escapeHtml(r.date)})</em><br/><small>${escapeHtml(r.evidence || 'No evidence provided')}</small></li>`).join('')}
          </ul>
        `).join('')}
      </section>
      <section>
        <h4>Growth Indicators</h4>
        <p>Focuses on demonstration of competencies, disposition, and progress over time.</p>
        <p><strong>Learner Notes:</strong> ${escapeHtml(learner.notes || 'No notes')}</p>
      </section>
      <section>
        <h4>Teacher Qualitative Comment</h4>
        <p>${escapeHtml(comment || 'No teacher comment entered.')}</p>
      </section>
    </div>
  `;
  $('reportOutput').innerHTML = reportHtml;
}

function bindBackupModule() {
  $('exportAllJson').addEventListener('click', exportFullBackup);
  $('downloadLearnerTemplate').addEventListener('click', downloadLearnerCsvTemplate);
  $('importLearnersBtn').addEventListener('click', importLearnersFromCsv);
}

async function exportFullBackup() {
  const data = {};
  for (const store of STORES) data[store] = await storeGetAll(store);
  downloadJson(`cbc_backup_${today}.json`, data);
}

function downloadLearnerCsvTemplate() {
  const templateRows = [{
    admissionNumber: 'JSS100', fullName: 'Jane Doe', dob: '2011-01-31', gender: 'Female', grade: 'Grade 7',
    stream: 'East', guardianPhone: '0712345678', guardianEmail: 'guardian@example.com', notes: 'Strength in collaboration', consent: 'true'
  }];
  downloadCsv('learner_import_template.csv', templateRows);
}

async function importLearnersFromCsv() {
  const fileInput = $('importLearnersFile');
  const file = fileInput.files[0];
  if (!file) return alert('Choose a CSV file first.');

  const text = await file.text();
  const rows = parseCsv(text);
  let count = 0;
  for (const row of rows) {
    if (!row.admissionNumber || !row.fullName) continue;
    await storeAdd('learners', {
      admissionNumber: row.admissionNumber.trim(),
      fullName: row.fullName.trim(),
      dob: row.dob || '',
      gender: row.gender || 'Prefer not to say',
      grade: row.grade || '',
      stream: row.stream || '',
      guardianPhone: row.guardianPhone || '',
      guardianEmail: row.guardianEmail || '',
      notes: row.notes || '',
      consent: String(row.consent).toLowerCase() === 'true'
    });
    count += 1;
  }
  alert(`Imported ${count} learners.`);
  fileInput.value = '';
  await refreshLearnerTable();
  await refreshReportLearnerOptions();
  await refreshDashboard();
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(',');
    const row = {};
    headers.forEach((header, i) => { row[header] = (values[i] || '').trim(); });
    return row;
  });
}

async function refreshDashboard() {
  const learners = await storeGetAll('learners');
  const attendance = await storeGetAll('attendance');
  const assessments = await storeGetAll('assessments');

  $('statLearners').textContent = learners.length;
  $('statStreams').textContent = new Set(learners.map((l) => `${l.grade}|${l.stream}`)).size;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weeklyAttendance = attendance.filter((a) => new Date(a.date) >= oneWeekAgo);
  $('statWeeklyAttendance').textContent = `${calculateAttendancePercentage(weeklyAttendance).toFixed(1)}%`;

  const allLevels = [];
  const alerts = {};
  assessments.forEach((event) => {
    event.entries.forEach((entry) => {
      Object.values(entry.levels).forEach((level) => {
        allLevels.push(level);
        if (level === 'Emerging' || level === 'Developing') {
          alerts[entry.learnerId] = (alerts[entry.learnerId] || 0) + 1;
        }
      });
    });
  });

  $('statMastery').textContent = averageMasteryText(allLevels);

  const masteryCounts = RUBRIC_LEVELS.reduce((acc, level) => ({ ...acc, [level]: 0 }), {});
  allLevels.forEach((level) => masteryCounts[level] = (masteryCounts[level] || 0) + 1);

  $('masteryOverview').innerHTML = RUBRIC_LEVELS
    .map((level) => `<li><span class="${levelClass(level)} level-pill">${level}</span>: ${masteryCounts[level] || 0}</li>`)
    .join('') || '<li>No assessment data yet.</li>';

  const supportList = $('supportAlerts');
  supportList.innerHTML = '';
  const sortedAlertLearners = Object.entries(alerts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!sortedAlertLearners.length) {
    supportList.innerHTML = '<li>No major support alerts currently.</li>';
    return;
  }
  sortedAlertLearners.forEach(([learnerId, count]) => {
    const learner = learners.find((l) => l.id === Number(learnerId));
    const li = document.createElement('li');
    li.textContent = `${learner?.fullName || 'Unknown learner'}: ${count} competencies below proficient`;
    supportList.appendChild(li);
  });
}

function calculateAttendancePercentage(records) {
  if (!records.length) return 0;
  const presentLike = records.filter((r) => r.status === 'Present' || r.status === 'Late').length;
  return (presentLike / records.length) * 100;
}

function averageMasteryText(levels) {
  if (!levels.length) return 'No Data';
  const map = { Emerging: 1, Developing: 2, Proficient: 3, Mastered: 4 };
  const avg = levels.reduce((sum, level) => sum + (map[level] || 0), 0) / levels.length;
  if (avg < 1.5) return 'Emerging';
  if (avg < 2.5) return 'Developing';
  if (avg < 3.5) return 'Proficient';
  return 'Mastered';
}

function levelClass(level) {
  return `level-${String(level || '').toLowerCase()}`;
}

function downloadCsv(filename, rows) {
  if (!rows.length) return alert('No data available for export.');
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))].join('\n');
  downloadBlob(filename, csv, 'text/csv;charset=utf-8;');
}

function downloadJson(filename, data) {
  downloadBlob(filename, JSON.stringify(data, null, 2), 'application/json');
}

function downloadBlob(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

window.addEventListener('DOMContentLoaded', init);
