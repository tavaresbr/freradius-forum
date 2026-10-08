const express = require('express');
const router = express.Router();
const db = require('../../db');
const { validarAssinatura } = require('../controllers/hotmartController');

// POST /api/updates/check
// Called by student servers - NO auth required
router.post('/check', async (req, res) => {
  const { email, last_update_id } = req.body;

  if (!email) {
    return res.status(400).json({ authorized: false, message: 'email e obrigatorio' });
  }

  try {
    const result = await validarAssinatura(email);
    if (!result.valid) {
      return res.json({ authorized: false, message: result.reason || 'Assinatura invalida' });
    }

    const [updates] = await db.execute(
      'SELECT id, descricao, changelog, criado_em FROM updates WHERE id > ? ORDER BY id ASC',
      [last_update_id || '']
    );

    res.json({ authorized: true, updates });
  } catch (err) {
    console.error('updateCheck /check error:', err);
    res.status(500).json({ authorized: false, message: err.message });
  }
});

// POST /api/updates/download/:updateId
// Called by student servers - NO auth required
router.post('/download/:updateId', async (req, res) => {
  const { updateId } = req.params;
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ authorized: false, message: 'email e obrigatorio' });
  }

  try {
    const result = await validarAssinatura(email);
    if (!result.valid) {
      return res.status(403).json({ authorized: false, message: result.reason || 'Assinatura invalida' });
    }

    const [[update]] = await db.execute(
      'SELECT id, descricao FROM updates WHERE id = ?',
      [updateId]
    );
    if (!update) {
      return res.status(404).json({ message: 'Update nao encontrado' });
    }

    const [files] = await db.execute(
      'SELECT file_path AS path, file_content AS content, action, encoding FROM update_files WHERE update_id = ? ORDER BY id ASC',
      [updateId]
    );
    const [migrations] = await db.execute(
      'SELECT sql_content AS `sql`, ordem FROM update_migrations WHERE update_id = ? ORDER BY ordem ASC',
      [updateId]
    );

    res.json({ id: update.id, descricao: update.descricao, files, migrations });
  } catch (err) {
    console.error('updateCheck /download error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
