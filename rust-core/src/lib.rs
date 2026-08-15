//! Deterministic score rules compiled to WebAssembly.
//! Rendering stays in Three.js; this module owns portable game arithmetic.

#[unsafe(no_mangle)]
pub extern "C" fn score_for_lantern(lit_count: u32, combo: u32) -> u32 {
    let multiplier = 100 + combo.saturating_sub(1).min(8) * 25;
    (100 + lit_count * 25) * multiplier / 100
}

#[unsafe(no_mangle)]
pub extern "C" fn next_combo(previous_combo: u32, elapsed_ms: u32) -> u32 {
    if elapsed_ms < 18_000 {
        previous_combo.saturating_add(1).min(9)
    } else {
        1
    }
}
