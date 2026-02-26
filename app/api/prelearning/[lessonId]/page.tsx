"use client";

import { useState } from "react";

export default function PrelearningPage() {
  const [step, setStep] = useState(1);
  const [notebookResult, setNotebookResult] = useState<any>(null);

  async function handleUpload(e: any) {
    const file = e.target.files[0];

    const formData = new FormData();
    formData.append("file", file);
    formData.append("lessonTitle", "Present Simple");

    const res = await fetch("/api/prelearning/evaluate-notebook", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setNotebookResult(data);
    setStep(2);
  }

  return (
    <div>
      {step === 1 && (
        <div>
          <h2>Upload Notebook PDF</h2>
          <input type="file" accept="application/pdf" onChange={handleUpload} />
        </div>
      )}

      {step === 2 && (
        <div>
          <h2>Notebook Evaluated</h2>
          <pre>{JSON.stringify(notebookResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}