// src/utils/timezone.js
import { format } from "date-fns-tz";

export const formatDateForExternalAPI = (
  date = new Date(),
  formatStr = "yyyy-MM-dd HH:mm:ss"
) => {
  const tz = process.env.TZ || "UTC";

  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });

    const formattedDate = format(date, formatStr, { timeZone: tz });

    console.log(
      `[TZ DEBUG] Fecha generada para API externa: "${formattedDate}" (Zona: ${tz})`
    );

    return formattedDate;
  } catch (e) {
    console.warn(
      `⚠️ [TZ ERROR] Zona horaria inválida '${tz}', usando UTC. Error: ${e.message}`
    );

    // Usa UTC como fallback
    const formattedDate = format(date, formatStr, { timeZone: "UTC" });

    console.log(
      `[TZ DEBUG] Fecha generada en fallback (UTC): "${formattedDate}"`
    );

    return formattedDate;
  }
};
