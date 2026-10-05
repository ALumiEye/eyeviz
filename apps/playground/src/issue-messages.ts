/**
 * Vietnamese wording for the messages of EyeViz issues and edit errors.
 *
 * The libraries report issues in English (the public API stays one language); the playground
 * translates the messages it shows. A message that matches no pattern is shown unchanged, so a
 * new or reworded message degrades to English instead of disappearing.
 * test/issue-messages.test.ts produces the real messages and checks that each one is translated.
 */

type Rule = readonly [RegExp, (...groups: string[]) => string];

/** Subjects of "… is not a finite number", e.g. "Position of 'A'". */
const SUBJECTS: readonly Rule[] = [
  [/^Position of label '(.+)'$/, (id) => `Vị trí của nhãn '${id}'`],
  [/^Position of '(.+)'$/, (id) => `Vị trí của '${id}'`],
  [/^Origin of '(.+)'$/, (id) => `Điểm gốc của '${id}'`],
  [/^Components of '(.+)'$/, (id) => `Các thành phần của '${id}'`],
  [/^Normal of '(.+)'$/, (id) => `Vectơ pháp tuyến của '${id}'`],
];

/** Kinds of things named in reference messages. */
const KINDS: Readonly<Record<string, string>> = {
  point: "điểm",
  object: "đối tượng",
  parameter: "tham số",
  "number parameter": "tham số số",
  "boolean parameter": "tham số bật/tắt",
  segment: "đoạn thẳng",
  curve: "đường cong",
  vector: "vectơ",
  plane: "mặt phẳng",
  surface: "mặt cong",
  implicit: "đường cong theo phương trình",
  label: "nhãn",
  step: "bước",
};

/** Zod's own type names in "expected number, received string". */
const TYPES: Readonly<Record<string, string>> = {
  number: "một số",
  string: "chữ",
  boolean: "true/false",
  array: "một danh sách",
  object: "một đối tượng",
  undefined: "không có giá trị",
  null: "null",
  tuple: "một danh sách",
  record: "một đối tượng",
};

/** jsonc-parser error codes as analyze.ts words them. */
const JSON_PROBLEMS: Readonly<Record<string, string>> = {
  "comma expected": "thiếu dấu phẩy",
  "colon expected": "thiếu dấu hai chấm",
  "value expected": "thiếu giá trị",
  "property name expected": "thiếu tên thuộc tính (trong dấu ngoặc kép)",
  "close brace expected": "thiếu dấu }",
  "close bracket expected": "thiếu dấu ]",
  "end of file expected": "có nội dung thừa ở cuối",
  "invalid symbol": "ký tự không hợp lệ",
  "invalid number format": "số không đúng định dạng",
  "unexpected end of string": "chuỗi chưa đóng dấu ngoặc kép",
  "unexpected end of comment": "chú thích chưa đóng",
  "invalid comment token": "JSON không cho phép chú thích",
};

const shape = (kind: string) => (kind === "Surface" ? "Mặt cong" : "Đường cong");

const kind = (name: string) => KINDS[name] ?? name;
const type = (name: string) => TYPES[name] ?? name;
const units = (unit: string) =>
  ({ characters: "ký tự", items: "phần tử", element: "phần tử" })[unit] ?? unit;

const RULES: readonly Rule[] = [
  // ── Expressions (math) ──
  [/^Expression is empty$/, () => "Công thức đang trống"],
  [
    /^Implicit multiplication is not allowed; write '\*' explicitly/,
    () => "Thiếu dấu nhân: hãy viết '*' rõ ràng, ví dụ '2*x' thay cho '2x'",
  ],
  [
    /^Invalid expression (".*") near character (\d+)$/,
    (source, at) => `Công thức ${source} không hợp lệ ở gần ký tự thứ ${at}`,
  ],
  [/^Unknown function '(.+)'$/, (name) => `Không có hàm '${name}'`],
  [
    /^Function '(.+)' takes (.+) argument\(s\), got (\d+)$/,
    (name, expected, got) =>
      `Hàm '${name}' cần ${expected.replace(" to ", " đến ")} đối số, nhưng nhận ${got}`,
  ],
  [
    /^An expression must be a single formula; found (.+)$/,
    (found) => `Mỗi ô chỉ chứa một công thức; có ký tự ${found}`,
  ],
  [/^Expression is longer than (\d+) characters$/, (n) => `Công thức dài quá ${n} ký tự`],
  [/^Expression is nested deeper than (\d+) levels$/, (n) => `Công thức lồng quá ${n} tầng ngoặc`],
  [/^Expression has more than (\d+) terms$/, (n) => `Công thức có quá ${n} số hạng`],
  [/^Number literal is too large: (.+)$/, (n) => `Số quá lớn: ${n}`],

  // ── Symbols in expressions (core) ──
  [
    /^Unknown symbol '(.+?)' in expression (".*?")(?:\. Did you mean '(.+)'\?)?$/,
    (symbol, source, suggestion) =>
      `Chưa có tham số '${symbol}' (trong công thức ${source})` +
      (suggestion ? `. Có phải ý bạn là '${suggestion}'?` : ". Hãy thêm một tham số tên này"),
  ],
  [
    /^Function '(.+?)' must be called with arguments, e\.g\. (.+?), in expression (".*")$/,
    (name, example, source) =>
      `Hàm '${name}' cần có đối số, ví dụ ${example} (trong công thức ${source})`,
  ],
  [
    /^Boolean parameter '(.+?)' cannot be used in expression (".*?"); only number parameters can$/,
    (name, source) =>
      `Tham số bật/tắt '${name}' không dùng được trong công thức ${source}; chỉ dùng được tham số số`,
  ],
  [
    /^Object '(.+?)' cannot be used in expression (".*?"); expressions may only use (.+)$/,
    (name, source, allowed) =>
      `Không dùng được đối tượng '${name}' trong công thức ${source}; công thức chỉ dùng được ${allowed
        .replace("number parameters", "tham số số")
        .replace(/ and /g, " và ")}`,
  ],

  // ── Scene structure (spec) ──
  [/^A Scene Specification must be a JSON object$/, () => "Cảnh phải là một đối tượng JSON"],
  [/^Missing "version"\. Add (.+)$/, (fix) => `Thiếu "version". Hãy thêm ${fix}`],
  [
    /^Unsupported Scene Specification version (.+); this runtime supports (.+)$/,
    (version, supported) => `Không hỗ trợ phiên bản ${version}; bản này hỗ trợ ${supported}`,
  ],
  [/^Unknown fields? (.+)$/, (keys) => `Không có thuộc tính ${keys}`],
  [
    /^Duplicate ID '(.+?)' \(already used at (.+?)\)\..*$/,
    (id, at) =>
      `Tên '${id}' bị trùng (đã dùng ở ${at}). Tham số và đối tượng không được trùng tên nhau`,
  ],
  [
    /^Duplicate step ID '(.+?)' \(already used at (.+)\)$/,
    (id, at) => `Tên bước '${id}' bị trùng (đã dùng ở ${at})`,
  ],
  [
    /^Variable '(.+?)' of '(.+?)' collides with the ID at (.+)$/,
    (variable, id, at) => `Biến '${variable}' của '${id}' trùng với tên ở ${at}`,
  ],
  [
    /^"visible" of '(.+?)' must reference a boolean parameter; '(.+?)' is a number parameter$/,
    (id, ref) => `"Hiển thị" của '${id}' phải là tham số bật/tắt; '${ref}' là tham số số`,
  ],
  [
    /^Reference to unknown (.+?) '(.+)'$/,
    (expected, id) => `Không tìm thấy ${kind(expected)} '${id}'`,
  ],
  [
    /^'(.+?)' is an? (.+?), but an? (.+?) is required here$/,
    (id, actual, expected) => `'${id}' là ${kind(actual)}, nhưng ở đây cần ${kind(expected)}`,
  ],
  [
    /^Parameter '(.+?)': min \((.+?)\) must be less than max \((.+?)\)$/,
    (id, min, max) => `Tham số '${id}': giá trị nhỏ nhất (${min}) phải nhỏ hơn lớn nhất (${max})`,
  ],
  [
    /^Parameter '(.+?)': value (.+?) is below min (.+)$/,
    (id, value, min) => `Tham số '${id}': giá trị ${value} nhỏ hơn giá trị nhỏ nhất ${min}`,
  ],
  [
    /^Parameter '(.+?)': value (.+?) is above max (.+)$/,
    (id, value, max) => `Tham số '${id}': giá trị ${value} lớn hơn giá trị lớn nhất ${max}`,
  ],
  [
    /^Parameter '(.+?)': a slider needs both "min" and "max"$/,
    (id) => `Tham số '${id}': thanh trượt cần có cả giá trị nhỏ nhất và lớn nhất`,
  ],
  [
    /^(Surface|Implicit curve) '(.+?)' needs two different variables$/,
    (kind, id) => `${shape(kind)} '${id}' cần hai biến khác nhau`,
  ],
  [
    /^(Surface|Implicit curve) '(.+?)' has no domain for variable '(.+?)'; add (.+)$/,
    (kind, id, variable, fix) =>
      `${shape(kind)} '${id}' chưa có khoảng cho biến '${variable}'; hãy thêm ${fix}`,
  ],
  [
    /^The equation of '(.+?)' must contain exactly one '=', e\.g\. (.+)$/,
    (id, example) => `Phương trình của '${id}' phải có đúng một dấu '=', ví dụ ${example}`,
  ],
  [
    /^The equation of '(.+?)' is undefined on its whole domain$/,
    (id) => `Phương trình của '${id}' không xác định trên cả miền`,
  ],
  [/^An equation has exactly one '='$/, () => "Phương trình chỉ có đúng một dấu '='"],
  [
    /^Domain key '(.+?)' of '(.+?)' is not one of its variables \((.+)\)$/,
    (key, id, variables) => `Khoảng '${key}' của '${id}' không phải biến của nó (${variables})`,
  ],
  [
    /^'(.+?)' cannot be dragged by '(.+?)': that parameter is not interactive$/,
    (id, ref) => `Không kéo được '${id}' bằng '${ref}': tham số này không điều chỉnh được`,
  ],
  [/^'(.+?)' is listed twice in "drag"$/, (ref) => `'${ref}' bị liệt kê hai lần trong "drag"`],
  [
    /^Plane '(.+?)': use either "through" \(three points\) or "point" \+ "normal", not both$/,
    (id) => `Mặt phẳng '${id}': chỉ dùng một cách — qua ba điểm, hoặc một điểm và vectơ pháp tuyến`,
  ],
  [
    /^Plane '(.+?)' needs "through": \[three point IDs\], or both "point" and "normal"$/,
    (id) => `Mặt phẳng '${id}' cần ba điểm đi qua, hoặc một điểm và vectơ pháp tuyến`,
  ],
  [
    /^Plane '(.+?)' must pass through three different points$/,
    (id) => `Mặt phẳng '${id}' phải đi qua ba điểm khác nhau`,
  ],

  // ── Scene meaning (core) ──
  [
    /^The timeline duration cannot depend on time 't' itself$/,
    () => "Thời lượng hoạt cảnh không được phụ thuộc vào chính thời gian 't'",
  ],
  [
    /^'(.+?)' is reserved \(time, constants and function names cannot be used as IDs\)$/,
    (name) => `Không đặt tên là '${name}': tên này dành cho thời gian, hằng số hoặc hàm`,
  ],
  [
    /^Dragging '(.+?)' cannot change '(.+?)': its position does not use that parameter$/,
    (id, ref) => `Kéo '${id}' không đổi được '${ref}': vị trí của nó không dùng tham số này`,
  ],
  [
    /^'(.+?)' is part of a circular dependency \((.+)\)$/,
    (id, cycle) => `'${id}' phụ thuộc vòng tròn (${cycle})`,
  ],
  [
    /^(.+?) is not a finite number \((.+?)\) for the current parameters$/,
    (subject, value) =>
      `${translate(subject, SUBJECTS)} không xác định (${value}) với giá trị tham số hiện tại`,
  ],
  [
    /^Plane '(.+?)': points (.+?) are collinear, so they do not define a plane$/,
    (id, points) => `Mặt phẳng '${id}': các điểm ${points} thẳng hàng nên không xác định mặt phẳng`,
  ],
  [
    /^Plane '(.+?)': the normal vector must not be zero$/,
    (id) => `Mặt phẳng '${id}': vectơ pháp tuyến phải khác 0`,
  ],
  [
    /^Plane '(.+?)': extent must be a positive number, got (.+)$/,
    (id, value) => `Mặt phẳng '${id}': kích thước phải là số dương, đang là ${value}`,
  ],
  [
    /^Curve '(.+?)' is undefined on its whole domain \[(.+)\]$/,
    (id, domain) => `Đường cong '${id}' không xác định trên cả khoảng [${domain}]`,
  ],
  [
    /^Surface '(.+?)' is undefined on its whole domain$/,
    (id) => `Mặt cong '${id}' không xác định trên cả miền`,
  ],
  [
    /^The timeline duration must be a positive number, got (.+?) for the current parameters$/,
    (value) => `Thời lượng hoạt cảnh phải là số dương, đang là ${value}`,
  ],

  // ── Editing (authoring) ──
  [/^There is no (object|parameter|step) '(.+)'$/, (what, id) => `Không có ${kind(what)} '${id}'`],
  [/^There is nothing named '(.+)'$/, (id) => `Không có gì tên '${id}'`],
  [/^There is already a step '(.+)'$/, (id) => `Đã có bước '${id}'`],
  [/^The name '(.+)' is already used$/, (id) => `Tên '${id}' đã được dùng`],
  [
    /^'(.*)' is not a valid name: start with a letter or '_', then letters, digits or '_'$/,
    (id) =>
      `'${id}' không phải tên hợp lệ: bắt đầu bằng chữ cái (không dấu) hoặc '_', sau đó là chữ, số hoặc '_'`,
  ],
  [/^'(.+?)' is still used by (.+)$/, (id, users) => `'${id}' vẫn đang được dùng bởi ${users}`],
  [/^Use rename to change an ID$/, () => "Hãy dùng chức năng đổi tên để đổi tên"],
  [
    /^'(.+?)' cannot be changed here; use rename, or remove and add$/,
    (field) => `Không đổi '${field}' ở đây được; hãy đổi tên, hoặc xoá rồi thêm lại`,
  ],

  // ── Quick graph (authoring) ──
  [
    /^Function '(.+?)' is not supported\. Available: (.+)$/,
    (name, available) => `Chưa hỗ trợ hàm '${name}'. Các hàm dùng được: ${available}`,
  ],
  [
    /^Function '(.+?)' needs an argument, e\.g\. (.+)$/,
    (name, example) => `Hàm '${name}' cần có đối số, ví dụ ${example}`,
  ],

  // ── JSON mode (jsonc-parser, worded by analyze.ts) ──
  [
    /^JSON syntax error: (.+)$/,
    (problem) => `Lỗi cú pháp JSON: ${JSON_PROBLEMS[problem] ?? problem}`,
  ],

  // ── Zod defaults (spec schema) ──
  [
    /^Invalid input: expected (\w+), received (\w+)$/,
    (expected, received) => `Sai kiểu: cần ${type(expected)}, nhưng đang là ${type(received)}`,
  ],
  [/^Invalid input: expected (\w+)$/, (expected) => `Sai kiểu: cần ${type(expected)}`],
  [
    /^Invalid option: expected one of (.+)$/,
    (options) => `Giá trị không hợp lệ: chọn một trong ${options}`,
  ],
  [/^Invalid input: expected (".*")$/, (value) => `Giá trị không hợp lệ: cần ${value}`],
  [
    /^Too big: expected (\w+) to have <=?(\d+) (\w+)$/,
    (_, n, unit) => `Quá dài: tối đa ${n} ${units(unit)}`,
  ],
  [
    /^Too small: expected (\w+) to have >=?(\d+) (\w+)$/,
    (_, n, unit) => `Quá ngắn: cần ít nhất ${n} ${units(unit)}`,
  ],
  [/^Too big: expected number to be <=(.+)$/, (n) => `Số quá lớn: tối đa ${n}`],
  [/^Too small: expected number to be >=(.+)$/, (n) => `Số quá nhỏ: tối thiểu ${n}`],
  [/^Too small: expected number to be >(.+)$/, (n) => `Số phải lớn hơn ${n}`],
  [
    /^Invalid string: must match pattern (.+)$/,
    () => "Tên không hợp lệ: chỉ dùng chữ cái không dấu, số và '_'",
  ],
  [
    /^IDs must start with a letter or '_' and contain only letters, digits and '_'$/,
    () => "Tên phải bắt đầu bằng chữ cái (không dấu) hoặc '_', sau đó chỉ gồm chữ, số và '_'",
  ],
  [/^Colors must be '#rrggbb' hex strings$/, () => "Màu phải có dạng '#rrggbb', ví dụ '#1c7ed6'"],
  [/^Invalid input$/, () => "Giá trị không hợp lệ"],
];

function translate(message: string, rules: readonly Rule[]): string {
  for (const [pattern, render] of rules) {
    const match = pattern.exec(message);
    if (match) return render(...match.slice(1).map((group) => group ?? ""));
  }
  return message;
}

/** The Vietnamese wording of an issue or edit-error message (unchanged if unknown). */
export function toVietnamese(message: string): string {
  return translate(message, RULES);
}

/** Whether a message has a Vietnamese wording (used by tests). */
export function hasVietnamese(message: string): boolean {
  return RULES.some(([pattern]) => pattern.test(message));
}
