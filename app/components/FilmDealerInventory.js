"use client";

import { useState } from "react";
import FilmDealerInventoryCore from "./FilmDealerInventoryCore";
import DealerReceiptImport from "./DealerReceiptImport";

export default function FilmDealerInventory() {
  const [revision, setRevision] = useState(0);
  const [locked, setLocked] = useState(false);

  return (
    <>
      <DealerReceiptImport
        onLocked={setLocked}
        onSaved={() => setRevision(value => value + 1)}
      />

      <fieldset
        disabled={locked}
        style={{
          border: 0,
          padding: 0,
          margin: 0,
          minWidth: 0,
        }}
      >
        <FilmDealerInventoryCore key={revision} />
      </fieldset>
    </>
  );
}
