#include <iostream>

// Native helper for the art pipeline. It writes the shared cinematic palette
// consumed by the WebGL scene, keeping grading constants outside the renderer.
int main() {
  std::cout << R"({
  "fog": "#2b4654",
  "moon": "#a8c7df",
  "ground": "#49625a",
  "path": "#9b7355",
  "lantern": "#ffbc62"
})";
}
