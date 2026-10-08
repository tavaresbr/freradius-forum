const express = require('express');
const router = express.Router();
const controller = require('../controllers/wireguardController');

router.get('/status', controller.getVpnStatus);
router.get('/settings', controller.getServerSettings);
router.put('/settings', controller.updateServerSettings);
router.post('/clients', controller.createClient);
router.delete('/clients/:id', controller.deleteClient);
router.get('/clients/:id/config', controller.getClientConfig);

module.exports = router;
