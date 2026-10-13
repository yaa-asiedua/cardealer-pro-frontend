import { useRef, useState } from "react";
import { Loader2, ScanLine } from "lucide-react";
import { api, ApiError } from "../../lib/api-client";

export interface IdScanFields {
  documentType: "GHANA_CARD" | "DRIVERS_LICENSE" | "PASSPORT" | "UNKNOWN";
  firstName: string | null;
  lastName: string | null;
  idType: string | null;
  idNumber: string | null;
  driverLicenseNo: string | null;
  licenseExpiry: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
}

interface IdScanResult {
  confidence: number;
  fields: IdScanFields;
}

const DOCUMENT_LABELS: Record<IdScanFields["documentType"], string> = {
  GHANA_CARD: "Ghana Card",
  DRIVERS_LICENSE: "driver's licence",
  PASSPORT: "passport",
  UNKNOWN: "card",
};

// Rental's intelligent assistant (POST /uploads/scan-id): photograph the
// customer's Ghana Card, driver's licence or passport and the details it
// reads prefill the form. OCR can misread, so it never saves anything —
// staff check every filled field against the card. The photo isn't stored.
// `onScanned` returns how many fields it actually filled.
export function IdScanButton({ onScanned, label = "Scan ID / licence" }: { onScanned: (fields: IdScanFields) => number; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  async function handleFile(file: File) {
    setIsScanning(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const result = await api.upload<IdScanResult>("/uploads/scan-id", formData);
      const filled = onScanned(result.fields);
      const doc = DOCUMENT_LABELS[result.fields.documentType];
      if (filled === 0) {
        setMessage({ tone: "error", text: "Couldn't read any details from that photo. Try again in good light, with the card filling the frame — or type them in." });
      } else if (result.confidence < 60) {
        setMessage({ tone: "warn", text: `Filled ${filled} field${filled === 1 ? "" : "s"} from the ${doc}, but the photo was hard to read — check each one carefully, or retake it.` });
      } else {
        setMessage({ tone: "ok", text: `Filled ${filled} field${filled === 1 ? "" : "s"} from the ${doc}. Please check them against the card before saving.` });
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't scan the card. Please type the details in." });
    } finally {
      setIsScanning(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        // opens the back camera on phones; a file picker elsewhere
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={isScanning}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-action/40 bg-action/5 px-3 py-2 text-sm font-medium text-action hover:bg-action/10 disabled:opacity-60"
      >
        {isScanning ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
        {isScanning ? "Reading card… (this can take a few seconds)" : label}
      </button>
      {message && (
        <p
          role="status"
          className={`text-xs ${message.tone === "ok" ? "text-success" : message.tone === "warn" ? "text-warning" : "text-danger"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
