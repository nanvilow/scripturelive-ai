import { Router, type IRouter } from "express";
import healthRouter from "./health";
import transcribeRouter from "./transcribe";
import telemetryRouter from "./telemetry";

const router: IRouter = Router();

router.use(healthRouter);
router.use(transcribeRouter);
router.use(telemetryRouter);

export default router;
