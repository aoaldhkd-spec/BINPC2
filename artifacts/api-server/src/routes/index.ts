import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dbRouter from "./db";

const router: IRouter = Router();

router.use(healthRouter);
router.use('/db', dbRouter);

export default router;
