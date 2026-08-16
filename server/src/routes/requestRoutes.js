const express = require("express");
const router = express.Router();
const requestController = require("../controllers/requestController");
const { requireAuth } = require("../middleware/auth");

router.post("/", requireAuth, requestController.createRequest);
router.get("/", requireAuth, requestController.myRequests);
router.get("/:id", requireAuth, requestController.getRequestById); // NEW (Read Single)
router.put("/:id", requireAuth, requestController.updateRequest); // NEW (Update)
router.delete("/:id", requireAuth, requestController.deleteRequest); // NEW (Delete)

router.post("/:id/approve", requireAuth, requestController.approveRequest);
router.post("/:id/decline", requireAuth, requestController.declineRequest);

module.exports = router;
