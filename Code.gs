const CONFIG = {
  SHEET_ID: '1MsWABlj_LdhWKzVq_u-1M6S5zEJ2yQ72oiusvzzQZAI',
  SHEET_NAME: 'Inscripción estudiantes',
  TIMEZONE: 'America/Bogota',
  NOTIFICATION_EMAIL: 'notificacionesmusicala@gmail.com',

  // Columnas según el formulario completo actual.
  // A = estudiante, C = documento, H = correo, AF = autorización, AG = autorizado por.
  STUDENT_NAME_COLUMN: 1,
  STUDENT_DOCUMENT_COLUMN: 3,
  EMAIL_COLUMN: 8,
  IMAGE_AUTHORIZATION_COLUMN: 32,
  IMAGE_AUTHORIZATION_BY_COLUMN: 33,

  // Opcional: si quieres guardar fecha de actualización, pon aquí el número de columna.
  // Si no tienes esa columna, déjalo en 0.
  UPDATED_AT_COLUMN: 0
};

function doGet(e) {
  try {
    assertConfig_();
    const action = String((e && e.parameter && e.parameter.action) || '').trim();

    // Compatibilidad con la versión anterior.
    if (action === 'getStudentByEmail') {
      const email = normalizeEmail_((e && e.parameter && e.parameter.email) || '');
      if (!email) return jsonResponse_({ ok: false, message: 'Escribe el correo registrado.' });

      const sheet = getSheet_();
      const result = findStudentByEmail_(sheet, email);
      if (!result) return jsonResponse_({ ok: false, code: 'NOT_FOUND', message: 'No encontramos un estudiante con ese correo.' });

      return jsonResponse_({ ok: true, student: studentResponse_(result) });
    }

    if (action === 'getStudent') {
      const sheet = getSheet_();
      const lookupMode = String((e && e.parameter && e.parameter.lookupMode) || 'email').trim().toLowerCase();
      let result = null;

      if (lookupMode === 'document') {
        const documentType = normalizeDocumentType_((e && e.parameter && e.parameter.documentType) || '');
        const documentNumber = normalizeDocumentNumber_((e && e.parameter && e.parameter.documentNumber) || '');
        if (!documentType) return jsonResponse_({ ok: false, message: 'Selecciona el tipo de documento.' });
        if (!documentNumber) return jsonResponse_({ ok: false, message: 'Escribe el número de documento.' });

        result = findStudentByDocumentNumber_(sheet, documentNumber);
        if (!result) return jsonResponse_({ ok: false, code: 'NOT_FOUND', message: 'No encontramos un estudiante con ese número de documento.' });

        result.documentUpdatedPreview = buildDocumentValue_(documentType, documentNumber);
      } else {
        const email = normalizeEmail_((e && e.parameter && e.parameter.email) || '');
        if (!email) return jsonResponse_({ ok: false, message: 'Escribe el correo registrado.' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse_({ ok: false, message: 'El correo no es válido.' });

        result = findStudentByEmail_(sheet, email);
        if (!result) return jsonResponse_({ ok: false, code: 'NOT_FOUND', message: 'No encontramos un estudiante con ese correo.' });
      }

      return jsonResponse_({ ok: true, student: studentResponse_(result) });
    }

    return jsonResponse_({ ok: true, service: 'Musicala autorización de imagen', timestamp: new Date().toISOString() });
  } catch (error) {
    return jsonResponse_({ ok: false, message: getErrorMessage_(error) });
  }
}

function doPost(e) {
  try {
    assertConfig_();

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No se recibió información para actualizar la autorización.');
    }

    const payload = JSON.parse(e.postData.contents);
    const action = String(payload.action || '').trim();

    if (action !== 'updateImageAuthorization') {
      throw new Error('Acción no válida.');
    }

    const lookupMode = String(payload.lookupMode || 'email').trim().toLowerCase();
    const imageUseAuthorization = normalizeChoice_(payload.imageUseAuthorization);
    const imageUseAuthorizationBy = normalizeAuthorizationBy_(payload.imageUseAuthorizationBy || '');

    if (!imageUseAuthorization) throw new Error('Selecciona si autorizas o no autorizas el uso de imagen.');

    const sheet = getSheet_();
    let result = null;
    let documentWasUpdated = false;
    let normalizedDocument = '';

    if (lookupMode === 'document') {
      const documentType = normalizeDocumentType_(payload.documentType || '');
      const documentNumber = normalizeDocumentNumber_(payload.documentNumber || '');
      if (!documentType) throw new Error('Selecciona el tipo de documento.');
      if (!documentNumber) throw new Error('Escribe el número de documento.');

      result = findStudentByDocumentNumber_(sheet, documentNumber);
      if (!result) {
        return jsonResponse_({ ok: false, code: 'NOT_FOUND', message: 'No encontramos un estudiante con ese número de documento.' });
      }

      normalizedDocument = buildDocumentValue_(documentType, documentNumber);
      sheet.getRange(result.row, CONFIG.STUDENT_DOCUMENT_COLUMN).setValue(normalizedDocument);
      result.studentDocument = normalizedDocument;
      documentWasUpdated = true;
    } else {
      const email = normalizeEmail_(payload.studentEmail || payload.email || '');
      if (!email) throw new Error('El correo es obligatorio.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('El correo no es válido.');

      result = findStudentByEmail_(sheet, email);
      if (!result) {
        return jsonResponse_({ ok: false, code: 'NOT_FOUND', message: 'No encontramos un estudiante con ese correo.' });
      }
    }

    sheet.getRange(result.row, CONFIG.IMAGE_AUTHORIZATION_COLUMN).setValue(imageUseAuthorization);
    if (Number(CONFIG.IMAGE_AUTHORIZATION_BY_COLUMN || 0) > 0) {
      sheet.getRange(result.row, CONFIG.IMAGE_AUTHORIZATION_BY_COLUMN).setValue(imageUseAuthorizationBy || 'Formulario estudiantes antiguos');
    }

    const updatedAt = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

    if (Number(CONFIG.UPDATED_AT_COLUMN || 0) > 0) {
      sheet.getRange(result.row, CONFIG.UPDATED_AT_COLUMN).setValue(updatedAt);
    }

    const notificationSent = sendNotificationEmail_({
      studentName: result.studentName,
      studentDocument: result.studentDocument,
      studentEmail: result.studentEmail,
      updatedAt: updatedAt,
      imageUseAuthorization: imageUseAuthorization,
      imageUseAuthorizationBy: imageUseAuthorizationBy,
      documentWasUpdated: documentWasUpdated,
      normalizedDocument: normalizedDocument
    });

    return jsonResponse_({
      ok: true,
      message: 'Autorización actualizada correctamente.',
      notificationSent: notificationSent,
      documentWasUpdated: documentWasUpdated,
      student: {
        studentName: result.studentName,
        studentDocument: result.studentDocument,
        studentEmail: result.studentEmail,
        imageUseAuthorization: imageUseAuthorization,
        imageUseAuthorizationBy: imageUseAuthorizationBy || 'Formulario estudiantes antiguos',
        updatedAt: updatedAt
      }
    });
  } catch (error) {
    return jsonResponse_({ ok: false, message: getErrorMessage_(error) });
  }
}

function doOptions() {
  return jsonResponse_({ ok: true });
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    const target = normalizeText_(CONFIG.SHEET_NAME);
    sheet = spreadsheet.getSheets().find(function (item) {
      return normalizeText_(item.getName()) === target;
    }) || null;
  }

  if (!sheet) {
    const available = spreadsheet.getSheets().map(function (item) { return item.getName(); }).join(', ');
    throw new Error('No se encontró la pestaña "' + CONFIG.SHEET_NAME + '". Pestañas disponibles: ' + available);
  }

  return sheet;
}

function findStudentByEmail_(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  assertColumn_(sheet, CONFIG.EMAIL_COLUMN, 'correo');

  const emailValues = sheet.getRange(2, CONFIG.EMAIL_COLUMN, lastRow - 1, 1).getValues();
  for (let i = 0; i < emailValues.length; i++) {
    const rowEmail = normalizeEmail_(emailValues[i][0]);
    if (rowEmail === email) return getStudentFromRow_(sheet, i + 2);
  }

  return null;
}

function findStudentByDocumentNumber_(sheet, documentNumber) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  assertColumn_(sheet, CONFIG.STUDENT_DOCUMENT_COLUMN, 'documento del estudiante');

  const wanted = normalizeDocumentNumber_(documentNumber);
  const docValues = sheet.getRange(2, CONFIG.STUDENT_DOCUMENT_COLUMN, lastRow - 1, 1).getValues();

  for (let i = 0; i < docValues.length; i++) {
    const rowDocumentNumber = extractDocumentNumber_(docValues[i][0]);
    if (rowDocumentNumber && rowDocumentNumber === wanted) return getStudentFromRow_(sheet, i + 2);
  }

  return null;
}

function getStudentFromRow_(sheet, row) {
  return {
    row: row,
    studentName: String(sheet.getRange(row, CONFIG.STUDENT_NAME_COLUMN).getDisplayValue() || '').trim(),
    studentDocument: String(sheet.getRange(row, CONFIG.STUDENT_DOCUMENT_COLUMN).getDisplayValue() || '').trim(),
    studentEmail: String(sheet.getRange(row, CONFIG.EMAIL_COLUMN).getDisplayValue() || '').trim(),
    imageUseAuthorization: String(sheet.getRange(row, CONFIG.IMAGE_AUTHORIZATION_COLUMN).getDisplayValue() || '').trim(),
    imageUseAuthorizationBy: String(sheet.getRange(row, CONFIG.IMAGE_AUTHORIZATION_BY_COLUMN).getDisplayValue() || '').trim()
  };
}

function studentResponse_(result) {
  return {
    studentName: result.studentName,
    studentDocument: result.studentDocument,
    studentEmail: result.studentEmail,
    imageUseAuthorization: result.imageUseAuthorization,
    imageUseAuthorizationBy: result.imageUseAuthorizationBy,
    documentUpdatedPreview: result.documentUpdatedPreview || ''
  };
}

function sendNotificationEmail_(data) {
  const to = String(CONFIG.NOTIFICATION_EMAIL || '').trim();
  if (!to) return false;

  try {
    const subject = 'Autorización de imagen actualizada - ' + (data.studentName || 'Estudiante Musicala');
    const documentNote = data.documentWasUpdated
      ? 'Documento actualizado al nuevo formato: ' + (data.normalizedDocument || data.studentDocument || '')
      : 'Documento sin cambios de formato.';

    const plainBody = [
      'Se actualizó una autorización de uso de imagen en Musicala.',
      '',
      'Estudiante: ' + (data.studentName || 'Sin nombre registrado'),
      'Documento: ' + (data.studentDocument || 'Sin documento registrado'),
      'Correo: ' + (data.studentEmail || 'Sin correo registrado'),
      'Fecha: ' + (data.updatedAt || ''),
      'Autorización registrada: ' + (data.imageUseAuthorization || ''),
      documentNote,
      '',
      'Este correo fue enviado automáticamente desde el formulario de estudiantes antiguos.'
    ].join('\n');

    const htmlBody =
      '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#1a1530">' +
      '<h2 style="margin:0 0 12px;color:#6f49ff">Autorización de imagen actualizada</h2>' +
      '<p>Se actualizó una autorización de uso de imagen en Musicala.</p>' +
      '<table style="border-collapse:collapse;width:100%;max-width:620px">' +
      rowHtml_('Estudiante', data.studentName || 'Sin nombre registrado') +
      rowHtml_('Documento', data.studentDocument || 'Sin documento registrado') +
      rowHtml_('Correo', data.studentEmail || 'Sin correo registrado') +
      rowHtml_('Fecha', data.updatedAt || '') +
      rowHtml_('Autorización registrada', data.imageUseAuthorization || '') +
      rowHtml_('Formato de documento', documentNote) +
      '</table>' +
      '<p style="margin-top:16px;color:#6b6480;font-size:13px">Correo automático del formulario de estudiantes antiguos.</p>' +
      '</div>';

    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: 'Musicala Notificaciones'
    });
    return true;
  } catch (error) {
    console.error('No se pudo enviar correo de notificación:', error);
    return false;
  }
}

function rowHtml_(label, value) {
  return '<tr>' +
    '<td style="padding:10px 12px;border:1px solid #e8deff;background:#faf7ff;font-weight:bold;width:220px">' + escapeHtml_(label) + '</td>' +
    '<td style="padding:10px 12px;border:1px solid #e8deff">' + escapeHtml_(value) + '</td>' +
    '</tr>';
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeDocumentType_(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
}

function normalizeDocumentNumber_(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s.\-]/g, '').replace(/[^A-Z0-9]/g, '');
}

function buildDocumentValue_(type, number) {
  return normalizeDocumentType_(type) + normalizeDocumentNumber_(number);
}

function extractDocumentNumber_(value) {
  const raw = normalizeDocumentNumber_(value);
  if (!raw) return '';

  // Si la celda ya tiene formato CC123, TI123, RC123, PASABC123, etc., quitamos el prefijo.
  const withoutKnownPrefix = raw.replace(/^(RC|CC|TI|CE|PAS|PPT)/, '');
  return withoutKnownPrefix || raw;
}

function normalizeText_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeChoice_(value) {
  const text = normalizeText_(value);
  if (['si', 'sí', 'autorizo', 'si autorizo'].indexOf(text) !== -1) return 'Sí';
  if (['no', 'no autorizo'].indexOf(text) !== -1) return 'No';
  return '';
}

function normalizeAuthorizationBy_(value) {
  const raw = String(value || '').trim();
  const text = normalizeText_(raw);
  if (text === 'estudiante') return 'Estudiante';
  if (['madre/padre/acudiente', 'madre padre acudiente', 'acudiente', 'madre', 'padre', 'tutor'].indexOf(text) !== -1) return 'Madre/Padre/Acudiente';
  return raw;
}

function assertColumn_(sheet, column, label) {
  const col = Number(column || 0);
  if (col < 1 || col > sheet.getLastColumn()) {
    throw new Error('La columna configurada para ' + label + ' no es válida.');
  }
}

function assertConfig_() {
  if (!CONFIG.SHEET_ID) throw new Error('Falta configurar el ID del archivo de Google Sheets.');
  if (!CONFIG.SHEET_NAME) throw new Error('Falta configurar el nombre de la pestaña de Google Sheets.');
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getErrorMessage_(error) {
  return error && error.message ? error.message : String(error || 'Error desconocido.');
}
