const paths = {
  home: (
    <>
      <path
        d="M14 37 48 10l34 27v45H14Z"
        fill="#dcecff"
      />
      <path
        d="m8 39 40-31 40 31"
        fill="none"
        stroke="#3984ef"
        strokeWidth="10"
        strokeLinejoin="round"
      />
      <path
        d="M38 82V52h20v30"
        fill="#3984ef"
      />
      <path
        d="M22 46h10v12H22m42-12h10v12H64"
        fill="#fff"
      />
    </>
  ),

  film: (
    <>
      <path
        d="M27 21h46v55H27Z"
        fill="#b9d5fb"
      />
      <ellipse
        cx="27"
        cy="48"
        rx="15"
        ry="27"
        fill="#448cf0"
      />
      <ellipse
        cx="27"
        cy="48"
        rx="8"
        ry="17"
        fill="#eff6ff"
      />
      <ellipse
        cx="27"
        cy="48"
        rx="3"
        ry="9"
        fill="#448cf0"
      />
      <path
        d="m50 65 28-25m-28 0 28 25"
        stroke="#64809f"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle
        cx="48"
        cy="68"
        r="9"
        fill="none"
        stroke="#3984ef"
        strokeWidth="6"
      />
      <circle
        cx="80"
        cy="68"
        r="9"
        fill="none"
        stroke="#3984ef"
        strokeWidth="6"
      />
    </>
  ),

  camera: (
    <>
      <path
        d="M15 29h66v49H15Z"
        fill="#475e7a"
      />
      <path
        d="M31 29v-9h28v9"
        fill="#7392b6"
      />
      <circle
        cx="48"
        cy="53"
        r="20"
        fill="#b9d5fb"
      />
      <circle
        cx="48"
        cy="53"
        r="13"
        fill="#3984ef"
      />
      <circle
        cx="71"
        cy="38"
        r="4"
        fill="#ffe7a4"
      />
    </>
  ),

  report: (
    <>
      <rect
        x="22"
        y="17"
        width="53"
        height="66"
        rx="9"
        fill="#3984ef"
      />
      <rect
        x="28"
        y="23"
        width="41"
        height="53"
        rx="5"
        fill="#fff"
      />
      <rect
        x="37"
        y="10"
        width="24"
        height="15"
        rx="5"
        fill="#64809f"
      />
      <path
        d="m35 42 5 5 9-10m-14 25 5 5 9-10"
        fill="none"
        stroke="#3984ef"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M54 43h9m-9 19h9"
        stroke="#b1c4dc"
        strokeWidth="4"
      />
      <path
        d="m67 76 14-39 7 3-14 39-8 6Z"
        fill="#ffc85b"
      />
    </>
  ),

  money: (
    <>
      <ellipse
        cx="34"
        cy="66"
        rx="20"
        ry="8"
        fill="#e9aa31"
      />
      <path
        d="M14 46v20c0 12 40 12 40 0V46"
        fill="#ffd475"
      />
      <ellipse
        cx="34"
        cy="46"
        rx="20"
        ry="8"
        fill="#ffe7a4"
      />
      <circle
        cx="65"
        cy="52"
        r="25"
        fill="#ffc85b"
      />
      <circle
        cx="65"
        cy="52"
        r="19"
        fill="#ffe7a4"
      />
      <path
        d="m53 43 6 19 6-17 6 17 6-19m-25 9h26"
        fill="none"
        stroke="#cd9225"
        strokeWidth="3"
      />
    </>
  ),

  people: (
    <>
      <circle
        cx="34"
        cy="31"
        r="14"
        fill="#ffd7b9"
      />
      <circle
        cx="68"
        cy="35"
        r="12"
        fill="#ffd7b9"
      />
      <path
        d="M10 81V65c0-30 48-30 48 0v16"
        fill="#3984ef"
      />
      <path
        d="M58 81V66c0-23 31-23 31 0v15"
        fill="#a9cbf9"
      />
      <path
        d="M19 24c3-19 30-19 31 0"
        fill="#64809f"
      />
    </>
  ),
};

export default function ToolIllustration({
  kind = "home",
  size = 64,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      aria-hidden="true"
      focusable="false"
      className="film-tool"
    >
      <ellipse
        cx="48"
        cy="86"
        rx="35"
        ry="5"
        fill="#dce6f1"
        opacity=".5"
      />
      {paths[kind] || paths.home}
    </svg>
  );
          }
