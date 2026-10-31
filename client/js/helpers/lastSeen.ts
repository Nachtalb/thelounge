import dayjs from "dayjs";

export default function lastSeen(time: number, now: number, use12h = false) {
	const minutes = Math.floor((now - time) / 60000);

	if (minutes < 1) {
		return "last seen just now";
	}

	if (minutes < 60) {
		return `last seen ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
	}

	const t = dayjs(time);
	const n = dayjs(now);
	const clock = t.format(use12h ? "h:mm A" : "HH:mm");

	if (t.isSame(n, "day")) {
		return `last seen today at ${clock}`;
	}

	if (t.isSame(n.subtract(1, "day"), "day")) {
		return `last seen yesterday at ${clock}`;
	}

	return `last seen ${t.format(t.isSame(n, "year") ? "D MMM" : "D MMM YYYY")} at ${clock}`;
}
