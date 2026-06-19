const CONFIG = {
  // Reemplaza por la URL publicada del Apps Script de este proyecto.
  apiUrl: 'https://script.google.com/macros/s/AKfycbyG6IovEeRJTBk09KXKoEmyMM0os39lHCLuJ1iRIiItNfTLETK0jLxZvCQk-BJbzKJFtQ/exec'
};

const form = document.getElementById('authorizationForm');
const emailInput = document.getElementById('studentEmail');
const documentTypeInput = document.getElementById('studentDocumentType');
const documentNumberInput = document.getElementById('studentDocumentNumber');
const emailLookupWrap = document.getElementById('emailLookupWrap');
const documentLookupWrap = document.getElementById('documentLookupWrap');
const searchBtn = document.getElementById('searchBtn');
const searchDocBtn = document.getElementById('searchDocBtn');
const submitBtn = document.getElementById('submitBtn');
const studentBox = document.getElementById('studentBox');
const authorizationBox = document.getElementById('authorizationBox');
const identityConfirmed = document.getElementById('identityConfirmed');
const foundStudentName = document.getElementById('foundStudentName');
const foundStudentDocument = document.getElementById('foundStudentDocument');
const documentFormatNote = document.getElementById('documentFormatNote');
const currentAuthorization = document.getElementById('currentAuthorization');
const toast = document.getElementById('toast');
const progressText = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const successModal = document.getElementById('successModal');
const closeSuccessBtn = document.getElementById('closeSuccessBtn');
const guardianNameWrap = document.getElementById('guardianNameWrap');
const guardianNameInput = document.getElementById('guardianName');

let foundStudent = null;
let lastLookup = { mode: 'email', email: '', documentType: '', documentNumber: '' };

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDocumentNumber(value) {
  return String(value || '').trim().replace(/\s+/g, '').replace(/[.\-]/g, '').toUpperCase();
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getLookupMode() {
  return form.querySelector('input[name="lookupMode"]:checked')?.value || 'email';
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => (toast.className = 'toast'), 4800);
}

function validateEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return 'Escribe el correo registrado.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return 'El correo no parece válido.';
  return '';
}

function validateDocument(type, number) {
  const documentType = String(type || '').trim().toUpperCase();
  const documentNumber = normalizeDocumentNumber(number);
  if (!documentType) return 'Selecciona el tipo de documento.';
  if (!documentNumber) return 'Escribe el número de documento.';
  if (!/^[A-Z0-9]+$/.test(documentNumber)) return 'El documento solo debe tener letras y números.';
  return '';
}

function setLoading(button, isLoading, loadingText, normalText) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : normalText;
}

function resetFoundStudent() {
  foundStudent = null;
  studentBox.classList.add('hidden');
  authorizationBox.classList.add('hidden');
  identityConfirmed.checked = false;
  submitBtn.disabled = true;
  foundStudentName.textContent = '—';
  foundStudentDocument.textContent = '—';
  documentFormatNote.textContent = '';
  currentAuthorization.textContent = 'Sin registrar';
  form.querySelectorAll('input[name="imageUseAuthorization"]').forEach((input) => {
    input.checked = false;
  });
  form.querySelectorAll('input[name="imageUseAuthorizationBy"]').forEach((input) => {
    input.checked = false;
  });
  guardianNameInput.value = '';
  updateGuardianNameUI();
  updateProgress();
}

function isGuardianAuthorization(value) {
  return value === 'Madre/Padre/Acudiente';
}

function updateGuardianNameUI() {
  const imageUseAuthorizationBy = form.querySelector('input[name="imageUseAuthorizationBy"]:checked')?.value || '';
  const shouldShow = isGuardianAuthorization(imageUseAuthorizationBy);
  guardianNameWrap.classList.toggle('hidden', !shouldShow);
  guardianNameInput.required = shouldShow;
  if (!shouldShow) guardianNameInput.value = '';
}

function updateLookupUI() {
  const mode = getLookupMode();
  emailLookupWrap.classList.toggle('hidden', mode !== 'email');
  documentLookupWrap.classList.toggle('hidden', mode !== 'document');
  emailInput.required = mode === 'email';
  documentTypeInput.required = mode === 'document';
  documentNumberInput.required = mode === 'document';
  resetFoundStudent();
  updateProgress();
}

function updateProgress() {
  const mode = getLookupMode();
  let percent = 0;

  if (mode === 'email' && validateEmail(emailInput.value) === '') percent = 33;
  if (mode === 'document' && validateDocument(documentTypeInput.value, documentNumberInput.value) === '') percent = 33;
  if (foundStudent) percent = 66;

  const auth = form.querySelector('input[name="imageUseAuthorization"]:checked');
  const authBy = form.querySelector('input[name="imageUseAuthorizationBy"]:checked');
  const guardianName = normalizeName(guardianNameInput.value);
  const guardianReady = authBy && (!isGuardianAuthorization(authBy.value) || guardianName.length >= 3);
  if (foundStudent && identityConfirmed.checked && auth && guardianReady) percent = 100;

  progressText.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;
  submitBtn.disabled = percent !== 100;
}

function assertApiUrl() {
  if (!CONFIG.apiUrl || CONFIG.apiUrl.includes('PEGAR_URL_DEL_APPS_SCRIPT')) {
    showToast('Falta configurar la URL del Apps Script en app.js.', 'error');
    return false;
  }
  return true;
}

function renderFoundStudent(student) {
  foundStudent = student;
  foundStudentName.textContent = foundStudent.studentName || 'Sin nombre registrado';
  foundStudentDocument.textContent = foundStudent.studentDocument || 'Sin documento registrado';

  if (foundStudent.documentUpdatedPreview && foundStudent.studentDocument !== foundStudent.documentUpdatedPreview) {
    documentFormatNote.textContent = `Al guardar se actualizará a: ${foundStudent.documentUpdatedPreview}`;
  } else {
    documentFormatNote.textContent = '';
  }

  currentAuthorization.textContent = foundStudent.imageUseAuthorization || 'Sin registrar';

  studentBox.classList.remove('hidden');
  authorizationBox.classList.remove('hidden');
  showToast('Estudiante encontrado. Revisa y confirma los datos.', 'success');
  updateProgress();
}

async function searchStudentByEmail() {
  const email = normalizeEmail(emailInput.value);
  const emailError = validateEmail(email);
  if (emailError) {
    showToast(emailError, 'error');
    return;
  }
  if (!assertApiUrl()) return;

  resetFoundStudent();
  lastLookup = { mode: 'email', email, documentType: '', documentNumber: '' };
  setLoading(searchBtn, true, 'Buscando...', 'Buscar estudiante');

  try {
    const url = `${CONFIG.apiUrl}?action=getStudent&lookupMode=email&email=${encodeURIComponent(email)}`;
    const response = await fetch(url, { method: 'GET' });
    const data = await response.json();

    if (!data.ok) {
      showToast(data.message || 'No encontramos un estudiante con ese correo.', 'error');
      return;
    }

    renderFoundStudent(data.student);
  } catch (error) {
    console.error(error);
    showToast('No se pudo consultar el registro. Revisa la conexión o la URL del Apps Script.', 'error');
  } finally {
    setLoading(searchBtn, false, 'Buscando...', 'Buscar estudiante');
  }
}

async function searchStudentByDocument() {
  const documentType = String(documentTypeInput.value || '').trim().toUpperCase();
  const documentNumber = normalizeDocumentNumber(documentNumberInput.value);
  const documentError = validateDocument(documentType, documentNumber);
  if (documentError) {
    showToast(documentError, 'error');
    return;
  }
  if (!assertApiUrl()) return;

  resetFoundStudent();
  lastLookup = { mode: 'document', email: '', documentType, documentNumber };
  setLoading(searchDocBtn, true, 'Buscando...', 'Buscar estudiante');

  try {
    const params = new URLSearchParams({
      action: 'getStudent',
      lookupMode: 'document',
      documentType,
      documentNumber
    });
    const response = await fetch(`${CONFIG.apiUrl}?${params.toString()}`, { method: 'GET' });
    const data = await response.json();

    if (!data.ok) {
      showToast(data.message || 'No encontramos un estudiante con ese documento.', 'error');
      return;
    }

    renderFoundStudent(data.student);
  } catch (error) {
    console.error(error);
    showToast('No se pudo consultar el registro. Revisa la conexión o la URL del Apps Script.', 'error');
  } finally {
    setLoading(searchDocBtn, false, 'Buscando...', 'Buscar estudiante');
  }
}

async function saveAuthorization(event) {
  event.preventDefault();

  if (!foundStudent) {
    showToast('Primero busca el estudiante.', 'error');
    return;
  }

  if (!identityConfirmed.checked) {
    showToast('Confirma que los datos corresponden al estudiante correcto.', 'error');
    return;
  }

  const imageUseAuthorization = form.querySelector('input[name="imageUseAuthorization"]:checked')?.value || '';
  const imageUseAuthorizationBy = form.querySelector('input[name="imageUseAuthorizationBy"]:checked')?.value || '';
  const guardianName = normalizeName(guardianNameInput.value);

  if (!imageUseAuthorization) {
    showToast('Selecciona si autorizas o no autorizas antes de guardar.', 'error');
    return;
  }

  if (!imageUseAuthorizationBy) {
    showToast('Selecciona si autoriza el acudiente o el estudiante.', 'error');
    return;
  }

  if (isGuardianAuthorization(imageUseAuthorizationBy) && guardianName.length < 3) {
    showToast('Escribe el nombre del acudiente que autoriza.', 'error');
    return;
  }

  const payload = {
    action: 'updateImageAuthorization',
    lookupMode: lastLookup.mode,
    studentEmail: lastLookup.email,
    documentType: lastLookup.documentType,
    documentNumber: lastLookup.documentNumber,
    imageUseAuthorization,
    imageUseAuthorizationBy,
    guardianName
  };

  setLoading(submitBtn, true, 'Guardando...', 'Guardar autorización');

  try {
    const response = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!data.ok) {
      showToast(data.message || 'No se pudo guardar la autorización.', 'error');
      return;
    }

    successModal.classList.remove('hidden');
    currentAuthorization.textContent = imageUseAuthorization;
    if (data.student?.studentDocument) {
      foundStudentDocument.textContent = data.student.studentDocument;
      documentFormatNote.textContent = '';
    }
    updateProgress();
  } catch (error) {
    console.error(error);
    showToast('No se pudo guardar. Revisa la conexión o el Apps Script.', 'error');
  } finally {
    setLoading(submitBtn, false, 'Guardando...', 'Guardar autorización');
    updateProgress();
  }
}

function bindIfExists(element, eventName, handler) {
  if (element) element.addEventListener(eventName, handler);
}

form.querySelectorAll('input[name="lookupMode"]').forEach((input) => {
  input.addEventListener('change', updateLookupUI);
});

bindIfExists(emailInput, 'input', () => {
  if (getLookupMode() === 'email') resetFoundStudent();
  updateProgress();
});

bindIfExists(documentTypeInput, 'change', () => {
  if (getLookupMode() === 'document') resetFoundStudent();
  updateProgress();
});

bindIfExists(documentNumberInput, 'input', () => {
  documentNumberInput.value = normalizeDocumentNumber(documentNumberInput.value);
  if (getLookupMode() === 'document') resetFoundStudent();
  updateProgress();
});

bindIfExists(searchBtn, 'click', searchStudentByEmail);
bindIfExists(searchDocBtn, 'click', searchStudentByDocument);
bindIfExists(form, 'submit', saveAuthorization);
bindIfExists(form, 'change', updateProgress);
bindIfExists(form, 'change', updateGuardianNameUI);
bindIfExists(guardianNameInput, 'input', updateProgress);
bindIfExists(closeSuccessBtn, 'click', () => successModal.classList.add('hidden'));
updateLookupUI();
