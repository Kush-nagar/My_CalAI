// STUB created by the UI worker so the Add flow typechecks. The barcode worker replaces this file.
import type { Food } from '../../domain/types';

export interface BarcodeSheetProps {
  onFound(food: Food): void;
  onManualEntry(barcode: string): void;
  onClose(): void;
}

export function BarcodeSheet(props: BarcodeSheetProps) {
  return (
    <div role="dialog" aria-label="Barcode scanner" style="padding:1rem">
      <p>Barcode scanning is not available in this build.</p>
      <button type="button" onClick={props.onClose}>Close</button>
    </div>
  );
}
