/**
 * Vietnamese text for the bundled examples. The files in `examples/` stay in English (they are
 * the project's public examples); the playground shows them in Vietnamese when the UI is.
 * Keys are the English strings: titles, descriptions, parameter labels, object names, steps.
 * test/examples-vi.test.ts checks that every string of every example is covered.
 */
export const EXAMPLE_TEXT_VI: Readonly<Record<string, string>> = {
  // Titles
  "Triangle with a moving vertex": "Tam giác có đỉnh di động",
  "Unit circle": "Đường tròn lượng giác",
  "Sine wave": "Sóng hình sin",
  "Vector addition": "Cộng hai vectơ",
  "Projectile motion": "Chuyển động ném xiên",
  "Harmonic oscillator": "Dao động điều hoà",
  "Square pyramid": "Hình chóp tứ giác đều",
  Paraboloid: "Mặt paraboloid",
  Helix: "Đường xoắn ốc",

  // Descriptions
  "Triangle ABC. Vertex C sits at distance r from A at angle theta, raised to height h. Drag C or use the sliders. Moving a point moves every segment attached to it.":
    "Tam giác ABC. Đỉnh C cách A một khoảng r theo góc θ và được nâng lên độ cao h. Kéo C hoặc dùng thanh trượt. Khi một điểm di chuyển, mọi cạnh nối với nó di chuyển theo.",
  "Drag P around the unit circle. Its projections on the axes are cos θ and sin θ.":
    "Kéo P trên đường tròn đơn vị. Hình chiếu của P lên hai trục là cos θ và sin θ.",
  "The graph of y = a·sin(k·x + φ) for x from −2π to 2π, with a point P on the curve at x = x0. Drag P along the wave.":
    "Đồ thị y = a·sin(k·x + φ) với x từ −2π đến 2π, có điểm P trên đồ thị tại x = x0. Kéo P dọc theo sóng.",
  "Vectors a and b from the origin and their sum a + b, completed into a parallelogram.":
    "Hai vectơ a, b chung gốc O và tổng a + b, theo quy tắc hình bình hành.",
  "A ball launched at speed v0 and angle θ under gravity g, ignoring air resistance. The faint curve is the full trajectory, the bright one the path travelled so far; the arrow is the velocity.":
    "Quả bóng được ném với vận tốc v0 theo góc θ, chịu gia tốc trọng trường g, bỏ qua sức cản không khí. Đường mờ là cả quỹ đạo, đường sáng là quãng đã đi; mũi tên là vận tốc.",
  "A mass oscillating as x(t) = A·cos(ω·t + φ). Left: the mass moving up and down about its equilibrium. Right: the graph of x against time, drawn as time runs; the faint curve shows two full periods.":
    "Vật dao động theo x(t) = A·cos(ω·t + φ). Bên trái: vật chuyển động lên xuống quanh vị trí cân bằng. Bên phải: đồ thị li độ x theo thời gian, vẽ dần khi thời gian trôi; đường mờ là hai chu kỳ đầy đủ.",
  "Pyramid S.ABCD with a square base of side 4 and apex S at height h above the center. The plane through S, A and B contains one lateral face.":
    "Hình chóp S.ABCD có đáy là hình vuông cạnh 4, đỉnh S ở độ cao h phía trên tâm đáy. Mặt phẳng qua S, A, B chứa một mặt bên.",
  "The surface z = a·(x² + y²) over the square −2 ≤ x, y ≤ 2, with a point P on the surface above (x0, y0). Drag P over the surface.":
    "Mặt z = a·(x² + y²) trên hình vuông −2 ≤ x, y ≤ 2, có điểm P trên mặt nằm phía trên (x0, y0). Kéo P trên mặt.",
  "A circular helix of radius R climbing c units per turn, drawn for a given number of turns.":
    "Đường xoắn ốc tròn bán kính R, mỗi vòng lên cao c đơn vị, vẽ theo số vòng cho trước.",

  // Steps
  "Vector a": "Vectơ a",
  "Draw a from the origin.": "Vẽ vectơ a từ gốc O.",
  "Vector b": "Vectơ b",
  "Draw b from the same origin.": "Vẽ vectơ b cũng từ gốc O.",
  "The sum a + b": "Tổng a + b",
  "Complete the parallelogram: its diagonal from the origin is a + b.":
    "Dựng hình bình hành: đường chéo xuất phát từ O chính là a + b.",
  "The base ABCD": "Đáy ABCD",
  "Start with the square base of side 4 in the plane z = 0.":
    "Bắt đầu với đáy hình vuông cạnh 4 nằm trong mặt phẳng z = 0.",
  "The apex S": "Đỉnh S",
  "S sits at height h above the center of the base; join it to every vertex.":
    "S nằm ở độ cao h phía trên tâm đáy; nối S với mọi đỉnh của đáy.",
  "The plane (SAB)": "Mặt phẳng (SAB)",
  "The three points S, A and B determine a plane that contains the lateral face SAB.":
    "Ba điểm S, A, B xác định một mặt phẳng chứa mặt bên SAB.",

  // Parameter labels
  "Amplitude A": "Biên độ A",
  "Amplitude a": "Biên độ a",
  "Angle θ": "Góc θ",
  "Angular frequency ω (rad/s)": "Tần số góc ω (rad/s)",
  "Curvature a": "Độ cong a",
  "Distance r": "Khoảng cách r",
  "Frequency k": "Tần số k",
  "Gravity g (m/s²)": "Gia tốc trọng trường g (m/s²)",
  "Height h": "Độ cao h",
  "Launch angle θ": "Góc ném θ",
  "Launch speed v0 (m/s)": "Vận tốc ném v0 (m/s)",
  "Phase φ": "Pha ban đầu φ",
  "Point position x0": "Vị trí điểm x0",
  "Radius R": "Bán kính R",
  "Rise per turn c": "Độ cao mỗi vòng c",
  "Show a + b": "Hiện a + b",
  "Show plane (SAB)": "Hiện mặt phẳng (SAB)",
  "Show sides AC and BC": "Hiện cạnh AC và BC",
  "Show velocity": "Hiện vận tốc",
  Turns: "Số vòng",
  "a — x component": "a — thành phần x",
  "a — y component": "a — thành phần y",
  "b — x component": "b — thành phần x",
  "b — y component": "b — thành phần y",

  // Object names
  Ball: "Quả bóng",
  "Current x(t)": "x(t) hiện tại",
  End: "Điểm cuối",
  "Foot of P on the x-axis": "Chân đường vuông góc từ P xuống trục x",
  "Foot of P": "Chân đường vuông góc từ P",
  "Full trajectory": "Cả quỹ đạo",
  "Guide to the y-axis": "Đường gióng sang trục y",
  Mass: "Vật nặng",
  Origin: "Gốc O",
  "P (drag me)": "P (kéo thử)",
  "Path so far": "Quãng đã đi",
  "Plane (SAB)": "Mặt phẳng (SAB)",
  "Point A": "Điểm A",
  "Point B": "Điểm B",
  "Point C": "Điểm C",
  "Point P on the surface": "Điểm P trên mặt",
  "Point P on the wave": "Điểm P trên sóng",
  "Projection on x": "Hình chiếu lên trục x",
  "Projection on y": "Hình chiếu lên trục y",
  "Radius OP": "Bán kính OP",
  "Same height": "Cùng độ cao",
  "Side AB": "Cạnh AB",
  "Side AC": "Cạnh AC",
  "Side BC": "Cạnh BC",
  "Spring anchor": "Điểm treo lò xo",
  Spring: "Lò xo",
  Start: "Điểm đầu",
  "Tip of a + b": "Ngọn của a + b",
  "Tip of a": "Ngọn của a",
  "Tip of b": "Ngọn của b",
  "Two periods of x(t)": "Hai chu kỳ của x(t)",
  "Vector a + b": "Vectơ a + b",
  "Velocity (scaled by 0.25 s)": "Vận tốc (thu nhỏ theo 0,25 s)",
  "x(t) so far": "x(t) đã vẽ",
};

/** Strings that read the same in Vietnamese (formulas and symbols). */
export const SAME_IN_VI: ReadonlySet<string> = new Set([
  "cos θ",
  "sin θ",
  "y = a·sin(k·x + φ)",
  "z = a·(x² + y²)",
  "x0",
  "y0",
]);
