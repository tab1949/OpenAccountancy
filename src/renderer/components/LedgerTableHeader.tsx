import type { ReactElement } from "react";
import type { LedgerHeaderCell } from "../../common/ledgerTable";

export function LedgerTableHeader({ rows }: { rows: LedgerHeaderCell[][] }): ReactElement {
  return <thead>{rows.map((row, rowIndex) => <tr key={rowIndex}>
    {row.map((cell, index) => <th key={index} colSpan={cell.colSpan} rowSpan={cell.rowSpan}
      scope={cell.colSpan ? "colgroup" : "col"}>{cell.label}</th>)}
  </tr>)}</thead>;
}
