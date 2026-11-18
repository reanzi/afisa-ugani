import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Times are UTC. 20:30 UTC is 23:30 in Tanzania (UTC+3), just before the
 * end of each due date. Each job only acts for councils whose Head of
 * Department switched auto-send on.
 */
const crons = cronJobs();

crons.monthly("auto-send food availability reports", { day: 22, hourUTC: 20, minuteUTC: 30 }, internal.autoSend.runFood, {});
crons.monthly("auto-send monthly ARDS reports", { day: 5, hourUTC: 20, minuteUTC: 30 }, internal.autoSend.runMonthly, {});

export default crons;
