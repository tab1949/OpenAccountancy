import { useEffect, useMemo, useState } from "react";
import type { BooksetOperationResult, BooksetSummary } from "@common/contracts";

export type BooksetOperationType =
  | "create"
  | "open"
  | "close"
  | "import"
  | "export"
  | "backup"
  | "restore";

interface BooksetOperationModalProps {
  operation: BooksetOperationType;
  currentBooksetLabel: string;
  hasOpenedBookset: boolean;
  onClose: () => void;
  onCompleted: () => Promise<void>;
}

function operationTitle(operation: BooksetOperationType): string {
  switch (operation) {
    case "create":
      return "新建账套";
    case "open":
      return "打开账套";
    case "close":
      return "关闭账套";
    case "import":
      return "导入账套";
    case "export":
      return "导出账套";
    case "backup":
      return "备份账套";
    case "restore":
      return "恢复备份";
    default:
      return "账套操作";
  }
}

function defaultPackageName(op: BooksetOperationType): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (op === "backup") {
    return `bookset-backup-${stamp}.oabk`;
  }
  if (op === "export") {
    return `bookset-export-${stamp}.oabk`;
  }
  return `bookset-${stamp}.oabk`;
}

export function BooksetOperationModal({
  operation,
  currentBooksetLabel,
  hasOpenedBookset,
  onClose,
  onCompleted
}: BooksetOperationModalProps): JSX.Element {
  const [booksets, setBooksets] = useState<BooksetSummary[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createBookCode, setCreateBookCode] = useState("");
  const [createStandard, setCreateStandard] = useState<"ASBE_2006" | "SBE_2011">("ASBE_2006");
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [createPeriodNo, setCreatePeriodNo] = useState(new Date().getMonth() + 1);
  const [createCurrency, setCreateCurrency] = useState("CNY");

  const [selectedBooksetId, setSelectedBooksetId] = useState<number | null>(null);
  const [importPackagePath, setImportPackagePath] = useState("");
  const [importDirectory, setImportDirectory] = useState("");
  const [packageOutputPath, setPackageOutputPath] = useState("");
  const [restorePackagePath, setRestorePackagePath] = useState("");

  useEffect(() => {
    const onEsc = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const loadBooksets = async (): Promise<void> => {
    const items = await window.openAccountancy.listBooksets();
    setBooksets(items);
  };

  useEffect(() => {
    void loadBooksets();
  }, []);

  useEffect(() => {
    if (booksets.length === 0) {
      return;
    }

    if ((operation === "open" || operation === "export" || operation === "restore") && selectedBooksetId === null) {
      setSelectedBooksetId(booksets[0]?.id ?? null);
      return;
    }

    if (operation === "backup" || operation === "close") {
      const current = booksets.find((item) => item.status === "open");
      if (current) {
        setSelectedBooksetId(current.id);
      }
    }
  }, [booksets, operation, selectedBooksetId]);

  const selectedBookset = useMemo(
    () => booksets.find((item) => item.id === selectedBooksetId) ?? null,
    [booksets, selectedBooksetId]
  );

  const applyResult = async (result: BooksetOperationResult): Promise<void> => {
    setMessage(result.message);
    if (result.ok) {
      await onCompleted();
      onClose();
    }
  };

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setMessage("");
    try {
      if (operation === "create") {
        await applyResult(
          await window.openAccountancy.createBookset({
            name: createName,
            bookCode: createBookCode,
            accountingStandard: createStandard,
            fiscalYear: createYear,
            fiscalPeriodNo: createPeriodNo,
            baseCurrency: createCurrency
          })
        );
        return;
      }

      if (operation === "open") {
        if (!selectedBooksetId) {
          setMessage("请选择要打开的账套。");
          return;
        }

        await applyResult(await window.openAccountancy.openBookset({ booksetId: selectedBooksetId }));
        return;
      }

      if (operation === "close") {
        await applyResult(await window.openAccountancy.closeBookset());
        return;
      }

      if (operation === "import") {
        await applyResult(
          await window.openAccountancy.importBooksetPackage({
            packagePath: importPackagePath,
            targetDirectory: importDirectory
          })
        );
        return;
      }

      if (operation === "export") {
        if (!selectedBooksetId) {
          setMessage("请选择要导出的账套。");
          return;
        }

        await applyResult(
          await window.openAccountancy.exportBooksetPackage({
            booksetId: selectedBooksetId,
            destinationPath: packageOutputPath
          })
        );
        return;
      }

      if (operation === "backup") {
        await applyResult(
          await window.openAccountancy.backupBookset({
            destinationPath: packageOutputPath
          })
        );
        return;
      }

      if (operation === "restore") {
        if (!selectedBooksetId) {
          setMessage("请选择要恢复的账套。");
          return;
        }

        await applyResult(
          await window.openAccountancy.restoreBooksetBackup({
            booksetId: selectedBooksetId,
            packagePath: restorePackagePath
          })
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = (() => {
    if (submitting) {
      return false;
    }

    if (operation === "create") {
      return Boolean(
        createName.trim() &&
        /^[A-Za-z0-9]{10}$/.test(createBookCode) &&
        Number.isInteger(createYear) && createYear >= 0 && createYear <= 9999 &&
        createPeriodNo >= 1 && createPeriodNo <= 12 &&
        createCurrency
      );
    }

    if (operation === "open") {
      return selectedBooksetId !== null;
    }

    if (operation === "close") {
      return hasOpenedBookset;
    }

    if (operation === "import") {
      return Boolean(importPackagePath.trim() && importDirectory.trim());
    }

    if (operation === "export") {
      return selectedBooksetId !== null && Boolean(packageOutputPath.trim());
    }

    if (operation === "backup") {
      return hasOpenedBookset && Boolean(packageOutputPath.trim());
    }

    if (operation === "restore") {
      return selectedBooksetId !== null && Boolean(restorePackagePath.trim());
    }

    return false;
  })();

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-label={operationTitle(operation)} onClick={(e) => e.stopPropagation()}>
        <h2>{operationTitle(operation)}</h2>

        {operation === "create" ? (
          <div className="form-grid">
            <label>
              账套名称
              <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} />
            </label>
            <label>
              会计准则
              <select value={createStandard} onChange={(e) => setCreateStandard(e.target.value as "ASBE_2006" | "SBE_2011")}>
                <option value="ASBE_2006">企业会计准则</option>
                <option value="SBE_2011">小企业会计准则</option>
              </select>
            </label>
            <label>
              账套号（10 位字母或数字）
              <input type="text" maxLength={10} value={createBookCode} onChange={(e) => setCreateBookCode(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} />
            </label>
            <div className="bookset-period-inputs">
              <label>
                启用年度（0000–9999）
                <input type="number" min="0" max="9999" value={createYear} onChange={(e) => setCreateYear(Number(e.target.value))} />
              </label>
              <label>
                启用月份
                <select value={createPeriodNo} onChange={(e) => setCreatePeriodNo(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                    <option key={month} value={month}>{String(month).padStart(2, "0")} 月</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              记账本位币
              <select value={createCurrency} onChange={(e) => setCreateCurrency(e.target.value)}>
                <option value="CNY">CNY - 人民币</option>
                <option value="HKD">HKD - 港币</option>
                <option value="USD">USD - 美元</option>
                <option value="AUD">AUD - 澳元</option>
                <option value="EUR">EUR - 欧元</option>
                <option value="JPY">JPY - 日元</option>
                <option value="SGD">SGD - 新加坡元</option>
                <option value="GBP">GBP - 英镑</option>
                <option value="CAD">CAD - 加拿大元</option>
                <option value="CHF">CHF - 瑞士法郎</option>
              </select>
            </label>
            <p className="auth-hint">准则、账套号、启用期间和本位币创建后不可更改。</p>
          </div>
        ) : null}

        {operation === "open" ? (
          <div className="form-grid">
            <label>
              选择账套
              <select
                value={selectedBooksetId ?? ""}
                onChange={(e) => setSelectedBooksetId(Number(e.target.value) || null)}
              >
                {booksets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {item.fiscalPeriod}
                  </option>
                ))}
              </select>
            </label>
            <div className="auth-actions">
              <button type="button" className="btn btn-small" onClick={() => void loadBooksets()}>
                刷新列表
              </button>
            </div>
          </div>
        ) : null}

        {operation === "close" ? (
          <p className="auth-hint">
            {hasOpenedBookset ? `确认关闭当前账套：${currentBooksetLabel} ?` : "当前没有打开的账套。"}
          </p>
        ) : null}

        {operation === "import" ? (
          <div className="form-grid">
            <label>
              账套压缩包
              <input type="text" value={importPackagePath} readOnly />
            </label>
            <label>
              导入目录
              <input type="text" value={importDirectory} readOnly />
            </label>
            <div className="auth-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  void window.openAccountancy.pickPackageFile().then((filePath) => {
                    if (filePath) {
                      setImportPackagePath(filePath);
                    }
                  });
                }}
              >
                选择压缩包
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  void window.openAccountancy.pickDirectory().then((dir) => {
                    if (dir) {
                      setImportDirectory(dir);
                    }
                  });
                }}
              >
                选择目录
              </button>
            </div>
          </div>
        ) : null}

        {operation === "export" ? (
          <div className="form-grid">
            <label>
              选择账套
              <select
                value={selectedBooksetId ?? ""}
                onChange={(e) => setSelectedBooksetId(Number(e.target.value) || null)}
              >
                {booksets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {item.fiscalPeriod}
                  </option>
                ))}
              </select>
            </label>
            <label>
              导出文件
              <input type="text" value={packageOutputPath} readOnly />
            </label>
            <div className="auth-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  void window.openAccountancy.pickPackageSavePath(defaultPackageName("export")).then((filePath) => {
                    if (filePath) {
                      setPackageOutputPath(filePath);
                    }
                  });
                }}
              >
                选择导出位置
              </button>
            </div>
          </div>
        ) : null}

        {operation === "backup" ? (
          <div className="form-grid">
            <p className="auth-hint">当前账套：{hasOpenedBookset ? currentBooksetLabel : "未打开账套"}</p>
            <label>
              备份文件
              <input type="text" value={packageOutputPath} readOnly />
            </label>
            <div className="auth-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  void window.openAccountancy.pickPackageSavePath(defaultPackageName("backup")).then((filePath) => {
                    if (filePath) {
                      setPackageOutputPath(filePath);
                    }
                  });
                }}
              >
                选择备份位置
              </button>
            </div>
          </div>
        ) : null}

        {operation === "restore" ? (
          <div className="form-grid">
            <label>
              目标账套
              <select
                value={selectedBooksetId ?? ""}
                onChange={(e) => setSelectedBooksetId(Number(e.target.value) || null)}
              >
                {booksets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {item.fiscalPeriod}
                  </option>
                ))}
              </select>
            </label>
            <label>
              备份压缩包
              <input type="text" value={restorePackagePath} readOnly />
            </label>
            <div className="auth-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  void window.openAccountancy.pickPackageFile().then((filePath) => {
                    if (filePath) {
                      setRestorePackagePath(filePath);
                    }
                  });
                }}
              >
                选择压缩包
              </button>
            </div>
          </div>
        ) : null}

        {selectedBookset ? <p className="auth-hint">目标路径：{selectedBookset.filePath}</p> : null}
        {message ? <p className="auth-hint">{message}</p> : null}

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={() => void submit()}>
            {submitting ? "处理中..." : "确定"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
