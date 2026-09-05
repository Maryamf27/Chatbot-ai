import { Router } from "express";
import { handleChat } from "../controllers/ai.controller.js";

export const chatRouter = Router();

chatRouter.post("/", handleChat);
