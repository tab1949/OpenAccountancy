import { useNavigate } from "react-router-dom";
import { VoucherEditor } from "./VoucherEditor";

export function VoucherFillPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <VoucherEditor
      onSaved={() => {
        navigate("/app/voucher/query");
      }}
    />
  );
}
