"use client";

import { useEffect, useState } from "react";
import { tradeApi } from "../../components/TradeClients";

export default function CustomerChoice({
  value,
  onChange,
  disabled,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;

    tradeApi()
      .then((result) => {
        if (live) {
          setData(result);
          setError("");
        }
      })
      .catch((err) => {
        if (live) setError(err.message);
      });

    return () => {
      live = false;
    };
  }, [version]);

  const clients = data?.clients || [];
  const contacts = (data?.contacts || []).filter(
    (person) => person.client_id === value.clientId
  );

  function select(clientId, contactId = "") {
    const client = clients.find(
      (item) => item.id === clientId
    );

    const person = (data?.contacts || []).find(
      (item) =>
        item.id === contactId &&
        item.client_id === clientId
    );

    onChange({
      type: "business",
      clientId,
      contactId: person?.id || "",
      name: client?.name || "",
      phone: person?.phone || client?.phone || "",
    });
  }

  return (
    <fieldset
      disabled={disabled}
      style={{
        border: 0,
        padding: 0,
        margin: "0 0 16px",
      }}
    >
      <legend>고객 구분</legend>

      <div
        style={{
          display: "flex",
          gap: 16,
          margin: "10px 0",
        }}
      >
        {[
          ["personal", "개인고객"],
          ["business", "업체"],
        ].map(([type, label]) => (
          <label key={type}>
            <input
              type="radio"
              name="customer-type"
              checked={value.type === type}
              onChange={() =>
                onChange({
                  type,
                  clientId: "",
                  contactId: "",
                  name: "",
                  phone: "",
                })
              }
            />{" "}
            {label}
          </label>
        ))}
      </div>

      {value.type === "business" && (
        <>
          {error ? (
            <p role="alert">
              {error}{" "}
              <button
                type="button"
                onClick={() => setVersion((v) => v + 1)}
              >
                다시 불러오기
              </button>
            </p>
          ) : !data ? (
            <p>거래처를 불러오는 중…</p>
          ) : (
            <>
              <label>
                거래처
                <select
                  required
                  value={value.clientId}
                  onChange={(e) => select(e.target.value)}
                >
                  <option value="">업체 선택</option>
                  {clients.map((client) => (
                    <option
                      key={client.id}
                      value={client.id}
                    >
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                담당자 (선택)
                <select
                  value={value.contactId}
                  onChange={(e) =>
                    select(value.clientId, e.target.value)
                  }
                  disabled={!value.clientId}
                >
                  <option value="">
                    담당자 미지정 · 업체 대표 연락처
                  </option>
                  {contacts.map((person) => (
                    <option
                      key={person.id}
                      value={person.id}
                    >
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>

              <p>
                담당자를 선택하면 담당자 연락처를 사용합니다.
                현장 주소는 아래에 별도로 입력하세요.
              </p>

              <a
                href="/admin/clients"
                target="_blank"
                rel="noreferrer"
              >
                업체·담당자 등록 ↗
              </a>{" "}
              <button
                type="button"
                onClick={() => setVersion((v) => v + 1)}
              >
                목록 새로고침
              </button>
            </>
          )}
        </>
      )}
    </fieldset>
  );
                    }
