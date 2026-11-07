import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useCurrentAccountingPeriod } from "../CurrentAccountingPeriodContext";

function localDate(): string {
  const date = new Date();
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFor(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export function AccountingPeriodPicker(): ReactElement {
  const { currentAccountingPeriod, selectAccountingDate } = useCurrentAccountingPeriod();
  const selectedDate = currentAccountingPeriod?.date ?? localDate();
  const [visible, setVisible] = useState(false);
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: MouseEvent): void => {
      if (!pickerRef.current?.contains(event.target as Node)) setVisible(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setVisible(false);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [visible]);

  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const firstDay = dateFor(year, monthNumber, 1).getUTCDay();
  const daysInMonth = dateFor(year, monthNumber + 1, 0).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });

  const moveMonth = (change: number): void => {
    const target = year * 12 + monthNumber - 1 + change;
    if (target < 0 || target > 9999 * 12 + 11) return;
    setMonth(`${String(Math.floor(target / 12)).padStart(4, "0")}-${String(target % 12 + 1).padStart(2, "0")}`);
    setMessage("");
  };

  const chooseDate = async (date: string): Promise<void> => {
    setPending(true);
    setMessage("");
    try {
      const result = await selectAccountingDate(date);
      if (result.ok) setVisible(false);
      else setMessage(result.message);
    } catch {
      setMessage("无法切换会计期间，请重试。");
    } finally {
      setPending(false);
    }
  };

  const label = currentAccountingPeriod
    ? `${currentAccountingPeriod.date.replace(/-/g, "/")}-${String(currentAccountingPeriod.year).padStart(4, "0")}年${String(currentAccountingPeriod.periodNo).padStart(2, "0")}期(${currentAccountingPeriod.status === "closed" ? "已结账" : "未结账"})`
    : "选择会计日期";

  return (
    <div className="accounting-period-picker" ref={pickerRef}>
      <button type="button" className="toolbar-trigger" aria-expanded={visible} aria-controls="accounting-calendar"
        onClick={() => { setMonth(selectedDate.slice(0, 7)); setMessage(""); setVisible(!visible); }}>
        {label}
      </button>
      {visible ? (
        <div className="accounting-calendar" id="accounting-calendar" aria-label="选择会计日期">
          <div className="accounting-calendar-header">
            <button type="button" aria-label="上个月" disabled={pending || (year === 0 && monthNumber === 1)} onClick={() => moveMonth(-1)}>‹</button>
            <strong>{yearText}年{monthText}月</strong>
            <button type="button" aria-label="下个月" disabled={pending || (year === 9999 && monthNumber === 12)} onClick={() => moveMonth(1)}>›</button>
          </div>
          <div className="accounting-calendar-grid">
            {["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day} className="accounting-calendar-weekday">{day}</span>)}
            {cells.map((day, index) => day === null ? <span key={`empty-${index}`} /> : (
              <button key={day} type="button" disabled={pending}
                aria-label={`${yearText}年${monthText}月${String(day).padStart(2, "0")}日`}
                aria-pressed={`${month}-${String(day).padStart(2, "0")}` === selectedDate}
                onClick={() => void chooseDate(`${month}-${String(day).padStart(2, "0")}`)}>{day}</button>
            ))}
          </div>
          {message ? <p className="accounting-calendar-error" role="alert">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}