import type { ReactElement } from "react";
import { formatLedgerCell } from "../../common/ledgerTable";
import type { LedgerTable } from "../../common/ledgerTable";
import type { LedgerKind } from "../../common/contracts";

export function LedgerTableBody({ table, kind }: { table: LedgerTable; kind: LedgerKind }): ReactElement {
  return <tbody>{table.rows.map((row, index) => <tr key={index} className={`ledger-row-${row.kind}`}>
    {row.cells.map((cell, cellIndex) => <td key={cellIndex}>{formatLedgerCell(cell, kind)}</td>)}
  </tr>)}</tbody>;
}
