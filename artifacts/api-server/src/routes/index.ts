import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dbRouter from "./db";

import eventHubRouter from './event-hub';

const router: IRouter = Router();

router.use(healthRouter);
router.use('/db', dbRouter);
router.use('/event-hub', eventHubRouter);

export default router;
