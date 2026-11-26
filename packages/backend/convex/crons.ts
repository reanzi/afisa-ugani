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
// Quarterly and annual ARDS reports: the 7th; the job acts only in January, April, July and October.
crons.monthly("auto-send quarterly and annual ARDS reports", { day: 7, hourUTC: 20, minuteUTC: 30 }, internal.autoSend.runPeriodic, {});
// Weekly reports: Monday 02:00 UTC is 05:00 in Tanzania, ready for HQ's morning meeting.
crons.weekly("auto-send weekly section reports", { dayOfWeek: "monday", hourUTC: 2, minuteUTC: 0 }, internal.autoSend.runWeekly, {});

export default crons;
