// src/components/Global/InlineCalendar.jsx
import React, { useMemo, useState, useEffect } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import "./InlineCalendar.css";

const fmtISO = (d) => {
  if (!d) return "";
  const dd = d instanceof Date ? d : new Date(d);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, "0");
  const day = String(dd.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// ✅ parseo LOCAL (evita el -1 día)
const parseISODateLocal = (str) => {
  if (!str) return null;
  const [y, m, d] = String(str).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d); // local time
};

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const sameDay = (a, b) => a && b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const InlineCalendar = ({ value, onChange, locale = "es-AR", weekStartsOn = 1, minDate, maxDate }) => {
  const selectedDate = useMemo(() => {
    if (!value) return null;
    return value instanceof Date ? value : parseISODateLocal(value);
  }, [value]);

  const today = new Date();
  const [monthView, setMonthView] = useState(
    selectedDate ? startOfMonth(selectedDate) : startOfMonth(today)
  );

  useEffect(() => { if (selectedDate) setMonthView(startOfMonth(selectedDate)); }, [selectedDate]);

  const monthLabel = useMemo(() =>
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(monthView),
    [locale, monthView]
  );

  const weekdayLabels = useMemo(
    () => (weekStartsOn === 0 ? ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"] : ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"]),
    [weekStartsOn]
  );

  const gridDays = useMemo(() => {
    const first = startOfMonth(monthView);
    const firstWeekday = (first.getDay() + 7) % 7; // 0=Dom..6=Sáb
    const offset = (firstWeekday - weekStartsOn + 7) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const isOtherMonth = d.getMonth() !== monthView.getMonth();

      let isDisabled = false;
      const min = minDate ? (minDate instanceof Date ? minDate : parseISODateLocal(minDate)) : null;
      const max = maxDate ? (maxDate instanceof Date ? maxDate : parseISODateLocal(maxDate)) : null;
      if (min && d < new Date(min.getFullYear(), min.getMonth(), min.getDate())) isDisabled = true;
      if (max && d > new Date(max.getFullYear(), max.getMonth(), max.getDate())) isDisabled = true;

      cells.push({ date: d, isOtherMonth, isDisabled });
    }
    return cells;
  }, [monthView, weekStartsOn, minDate, maxDate]);

  return (
    <div className="cal-inline">
      <div className="cal-header">
        <button type="button" className="cal-nav" onClick={() => setMonthView(addMonths(monthView, -1))}>
          <FaChevronLeft />
        </button>
        <div className="cal-title">{monthLabel}</div>
        <button type="button" className="cal-nav" onClick={() => setMonthView(addMonths(monthView, 1))}>
          <FaChevronRight />
        </button>
      </div>

      <div className="cal-weekdays" aria-hidden="true">
        {weekdayLabels.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
      </div>

      <div className="cal-grid" role="grid" aria-label="Calendario">
        {gridDays.map(({ date: d, isOtherMonth, isDisabled }, idx) => {
          const isToday = sameDay(d, today);
          const isSelected = selectedDate && sameDay(d, selectedDate);
          return (
            <button
              key={idx}
              type="button"
              className={`cal-cell ${isOtherMonth ? "is-other" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
              onClick={() => !isDisabled && onChange?.(fmtISO(d))}
              disabled={isDisabled}
              aria-pressed={!!isSelected}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default InlineCalendar;
