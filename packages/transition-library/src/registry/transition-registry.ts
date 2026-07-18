import type { TransitionPreset } from "../schemas/transition.schema";

// Programmatic mapping helper to avoid boilerplate
function createPreset(fields: Partial<TransitionPreset> & { id: string; name: string }): TransitionPreset {
  return {
    category: "basic",
    engine: "fade",
    keywords: [],
    emotions: [],
    sceneTypes: [],
    supportedPace: ["slow", "medium", "fast"],
    defaultDurationFrames: 15,
    minimumDurationFrames: 5,
    maximumDurationFrames: 45,
    defaultIntensity: 0.5,
    supportsDirection: false,
    supportsColour: false,
    gpuCost: "low",
    ...fields
  };
}

export const transitionPresets: TransitionPreset[] = [
  // --- CATEGORY 1: Basic Transitions (1-10) ---
  createPreset({
    id: "fade_in", name: "Fade In", category: "basic", engine: "fade",
    keywords: ["general", "simple", "clean"], emotions: ["peaceful", "neutral"], gpuCost: "low"
  }),
  createPreset({
    id: "fade_out", name: "Fade Out", category: "basic", engine: "fade",
    keywords: ["general", "simple", "clean"], emotions: ["sad", "neutral"], gpuCost: "low"
  }),
  createPreset({
    id: "cross_dissolve", name: "Cross Dissolve", category: "basic", engine: "fade",
    keywords: ["general", "interview", "documentary"], emotions: ["peaceful", "happy"], gpuCost: "low"
  }),
  createPreset({
    id: "dip_to_black", name: "Dip to Black", category: "basic", engine: "fade",
    keywords: ["general", "cinematic", "mystery"], emotions: ["sad", "fearful"], gpuCost: "low"
  }),
  createPreset({
    id: "dip_to_white", name: "Dip to White", category: "basic", engine: "fade",
    keywords: ["general", "dream", "memory"], emotions: ["happy", "surprised"], gpuCost: "low"
  }),
  createPreset({
    id: "hard_cut", name: "Hard Cut", category: "basic", engine: "fade",
    keywords: ["general", "simple"], emotions: ["neutral"], defaultDurationFrames: 0, gpuCost: "low"
  }),
  createPreset({
    id: "soft_cut", name: "Soft Cut", category: "basic", engine: "fade",
    keywords: ["general", "vlog"], emotions: ["happy", "neutral"], defaultDurationFrames: 4, gpuCost: "low"
  }),
  createPreset({
    id: "fade_through_colour", name: "Fade Through Colour", category: "basic", engine: "fade",
    keywords: ["creative", "art"], emotions: ["happy"], supportsColour: true, gpuCost: "low"
  }),
  createPreset({
    id: "opacity_blend", name: "Opacity Blend", category: "basic", engine: "fade",
    keywords: ["documentary", "history"], emotions: ["sad", "peaceful"], gpuCost: "low"
  }),
  createPreset({
    id: "luma_fade", name: "Luma Fade", category: "basic", engine: "fade",
    keywords: ["cinematic", "history"], emotions: ["peaceful"], gpuCost: "medium"
  }),

  // --- CATEGORY 2: Slide Transitions (11-20) ---
  createPreset({
    id: "slide_left", name: "Slide Left", category: "slide", engine: "slide", supportsDirection: true,
    keywords: ["presentation", "technology", "list"], emotions: ["neutral"], audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.2 }
  }),
  createPreset({
    id: "slide_right", name: "Slide Right", category: "slide", engine: "slide", supportsDirection: true,
    keywords: ["presentation", "technology", "comparison"], emotions: ["neutral"], audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.2 }
  }),
  createPreset({
    id: "slide_up", name: "Slide Up", category: "slide", engine: "slide", supportsDirection: true,
    keywords: ["explainer", "tutorial"], emotions: ["happy"]
  }),
  createPreset({
    id: "slide_down", name: "Slide Down", category: "slide", engine: "slide", supportsDirection: true,
    keywords: ["explainer", "tutorial"], emotions: ["neutral"]
  }),
  createPreset({
    id: "double_slide", name: "Double Slide", category: "slide", engine: "slide",
    keywords: ["creative", "modern"], emotions: ["happy"], gpuCost: "medium"
  }),
  createPreset({
    id: "diagonal_slide_left", name: "Diagonal Slide Left", category: "slide", engine: "slide",
    keywords: ["creative", "abstract"], emotions: ["neutral"]
  }),
  createPreset({
    id: "diagonal_slide_right", name: "Diagonal Slide Right", category: "slide", engine: "slide",
    keywords: ["creative", "abstract"], emotions: ["neutral"]
  }),
  createPreset({
    id: "layered_slide", name: "Layered Slide", category: "slide", engine: "slide",
    keywords: ["presentation", "technology"], emotions: ["happy"], gpuCost: "medium"
  }),
  createPreset({
    id: "elastic_slide", name: "Elastic Slide", category: "slide", engine: "slide",
    keywords: ["creative", "social media"], emotions: ["happy"], audioEffect: { enabled: true, asset: "/audio/swipe.wav", volume: 0.3 }
  }),
  createPreset({
    id: "smooth_panel_slide", name: "Smooth Panel Slide", category: "slide", engine: "slide",
    keywords: ["explainer", "business"], emotions: ["peaceful"]
  }),

  // --- CATEGORY 3: Push Transitions (21-30) ---
  createPreset({
    id: "push_left", name: "Push Left", category: "push", engine: "push", supportsDirection: true,
    keywords: ["news", "progress", "next"], emotions: ["neutral"]
  }),
  createPreset({
    id: "push_right", name: "Push Right", category: "push", engine: "push", supportsDirection: true,
    keywords: ["news", "progress"], emotions: ["neutral"]
  }),
  createPreset({
    id: "push_up", name: "Push Up", category: "push", engine: "push", supportsDirection: true,
    keywords: ["news", "progress"], emotions: ["neutral"]
  }),
  createPreset({
    id: "push_down", name: "Push Down", category: "push", engine: "push", supportsDirection: true,
    keywords: ["news", "progress"], emotions: ["neutral"]
  }),
  createPreset({
    id: "fast_push", name: "Fast Push", category: "push", engine: "push",
    keywords: ["news", "fast", "urgent"], emotions: ["surprised"], supportedPace: ["fast"], audioEffect: { enabled: true, asset: "/audio/whoosh-fast.wav", volume: 0.35 }
  }),
  createPreset({
    id: "smooth_push", name: "Smooth Push", category: "push", engine: "push",
    keywords: ["documentary", "journey"], emotions: ["peaceful"]
  }),
  createPreset({
    id: "bounce_push", name: "Bounce Push", category: "push", engine: "push",
    keywords: ["vlog", "fun"], emotions: ["happy"], audioEffect: { enabled: true, asset: "/audio/swipe.wav", volume: 0.3 }
  }),
  createPreset({
    id: "perspective_push", name: "Perspective Push", category: "push", engine: "push",
    keywords: ["technology", "modern"], emotions: ["neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "depth_push", name: "Depth Push", category: "push", engine: "push",
    keywords: ["cinematic", "epic"], emotions: ["happy"], gpuCost: "medium"
  }),
  createPreset({
    id: "multi_layer_push", name: "Multi-Layer Push", category: "push", engine: "push",
    keywords: ["infographic", "list"], emotions: ["neutral"], gpuCost: "medium"
  }),

  // --- CATEGORY 4: Zoom Transitions (31-40) ---
  createPreset({
    id: "zoom_in", name: "Zoom In", category: "zoom", engine: "zoom",
    keywords: ["focus", "reveal", "product"], emotions: ["surprised", "happy"]
  }),
  createPreset({
    id: "zoom_out", name: "Zoom Out", category: "zoom", engine: "zoom",
    keywords: ["focus", "reveal", "location"], emotions: ["neutral", "sad"]
  }),
  createPreset({
    id: "fast_zoom_in", name: "Fast Zoom In", category: "zoom", engine: "zoom",
    keywords: ["surprise", "fast", "dramatic"], emotions: ["surprised"], supportedPace: ["fast"], audioEffect: { enabled: true, asset: "/audio/whoosh-fast.wav", volume: 0.4 }
  }),
  createPreset({
    id: "fast_zoom_out", name: "Fast Zoom Out", category: "zoom", engine: "zoom",
    keywords: ["surprise", "fast", "dramatic"], emotions: ["surprised"], supportedPace: ["fast"], audioEffect: { enabled: true, asset: "/audio/whoosh-fast.wav", volume: 0.4 }
  }),
  createPreset({
    id: "smooth_zoom_blend", name: "Smooth Zoom Blend", category: "zoom", engine: "zoom",
    keywords: ["cinematic", "nature", "peaceful"], emotions: ["peaceful"], gpuCost: "medium"
  }),
  createPreset({
    id: "zoom_blur", name: "Zoom Blur", category: "zoom", engine: "zoom",
    keywords: ["focus", "transition", "dramatic"], emotions: ["happy", "surprised"], gpuCost: "medium"
  }),
  createPreset({
    id: "centre_zoom", name: "Centre Zoom", category: "zoom", engine: "zoom",
    keywords: ["focus", "face"], emotions: ["neutral"]
  }),
  createPreset({
    id: "target_zoom", name: "Target Zoom", category: "zoom", engine: "zoom",
    keywords: ["focus", "product"], emotions: ["happy"]
  }),
  createPreset({
    id: "radial_zoom", name: "Radial Zoom", category: "zoom", engine: "zoom",
    keywords: ["creative", "modern"], emotions: ["neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "zoom_tunnel", name: "Zoom Tunnel", category: "zoom", engine: "zoom",
    keywords: ["gaming", "journey", "cyber"], emotions: ["happy"], gpuCost: "high"
  }),

  // --- CATEGORY 5: Blur Transitions (41-50) ---
  createPreset({
    id: "directional_blur", name: "Directional Blur", category: "blur", engine: "blur", supportsDirection: true,
    keywords: ["memory", "fast", "travel"], emotions: ["neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "gaussian_blur", name: "Gaussian Blur", category: "blur", engine: "blur",
    keywords: ["dream", "romantic", "peaceful"], emotions: ["peaceful", "sad"], gpuCost: "medium"
  }),
  createPreset({
    id: "motion_blur_left", name: "Motion Blur Left", category: "blur", engine: "blur",
    keywords: ["movement", "fast", "vlog"], emotions: ["neutral"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.25 }
  }),
  createPreset({
    id: "motion_blur_right", name: "Motion Blur Right", category: "blur", engine: "blur",
    keywords: ["movement", "fast", "vlog"], emotions: ["neutral"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.25 }
  }),
  createPreset({
    id: "motion_blur_up", name: "Motion Blur Up", category: "blur", engine: "blur",
    keywords: ["movement", "fast"], emotions: ["neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "motion_blur_down", name: "Motion Blur Down", category: "blur", engine: "blur",
    keywords: ["movement", "fast"], emotions: ["neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "radial_blur", name: "Radial Blur", category: "blur", engine: "blur",
    keywords: ["dramatic", "surprise"], emotions: ["surprised"], gpuCost: "medium"
  }),
  createPreset({
    id: "focus_pull", name: "Focus Pull", category: "blur", engine: "blur",
    keywords: ["cinematic", "interview"], emotions: ["peaceful"], gpuCost: "medium"
  }),
  createPreset({
    id: "defocus_blend", name: "Defocus Blend", category: "blur", engine: "blur",
    keywords: ["dream", "romantic"], emotions: ["sad", "romantic"], gpuCost: "medium"
  }),
  createPreset({
    id: "dream_blur", name: "Dream Blur", category: "blur", engine: "blur",
    keywords: ["dream", "memory", "flashback"], emotions: ["happy", "romantic"], gpuCost: "medium"
  }),

  // --- CATEGORY 6: Glitch Transitions (51-60) ---
  createPreset({
    id: "digital_glitch", name: "Digital Glitch", category: "glitch", engine: "glitch",
    keywords: ["technology", "cyber", "error"], emotions: ["fearful"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/glitch.wav", volume: 0.3 }
  }),
  createPreset({
    id: "rgb_split", name: "RGB Split", category: "glitch", engine: "glitch",
    keywords: ["gaming", "cyber", "music"], emotions: ["happy", "surprised"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/glitch.wav", volume: 0.25 }
  }),
  createPreset({
    id: "signal_distortion", name: "Signal Distortion", category: "glitch", engine: "glitch",
    keywords: ["technology", "error", "breaking news"], emotions: ["fearful"], gpuCost: "medium"
  }),
  createPreset({
    id: "vhs_glitch", name: "VHS Glitch", category: "glitch", engine: "glitch",
    keywords: ["vintage", "history", "memory"], emotions: ["sad", "neutral"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/glitch.wav", volume: 0.2 }
  }),
  createPreset({
    id: "pixel_break", name: "Pixel Break", category: "glitch", engine: "glitch",
    keywords: ["gaming", "creative"], emotions: ["happy"], gpuCost: "medium"
  }),
  createPreset({
    id: "data_corruption", name: "Data Corruption", category: "glitch", engine: "glitch",
    keywords: ["hacker", "cyber", "technology"], emotions: ["fearful"], gpuCost: "high"
  }),
  createPreset({
    id: "horizontal_tear", name: "Horizontal Tear", category: "glitch", engine: "glitch",
    keywords: ["error", "breaking news"], emotions: ["neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "vertical_tear", name: "Vertical Tear", category: "glitch", engine: "glitch",
    keywords: ["error", "breaking news"], emotions: ["neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "static_noise_cut", name: "Static Noise Cut", category: "glitch", engine: "glitch",
    keywords: ["technology", "tv"], emotions: ["fearful"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/glitch.wav", volume: 0.35 }
  }),
  createPreset({
    id: "cyber_glitch", name: "Cyber Glitch", category: "glitch", engine: "glitch",
    keywords: ["gaming", "cyber", "technology"], emotions: ["happy"], gpuCost: "high"
  }),

  // --- CATEGORY 7: Light Transitions (61-70) ---
  createPreset({
    id: "light_leak", name: "Light Leak", category: "light", engine: "overlay",
    keywords: ["sunset", "romantic", "wedding", "beach"], emotions: ["happy", "peaceful", "romantic"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.2 }
  }),
  createPreset({
    id: "lens_flare", name: "Lens Flare", category: "light", engine: "overlay",
    keywords: ["sunset", "cinematic", "nature"], emotions: ["happy", "peaceful"], gpuCost: "medium"
  }),
  createPreset({
    id: "white_flash", name: "White Flash", category: "light", engine: "fade",
    keywords: ["breaking news", "fast", "reveal"], emotions: ["surprised"], defaultDurationFrames: 8, gpuCost: "low", audioEffect: { enabled: true, asset: "/audio/flash.wav", volume: 0.4 }
  }),
  createPreset({
    id: "golden_flash", name: "Golden Flash", category: "light", engine: "fade",
    keywords: ["temple", "spiritual", "sunset"], emotions: ["happy", "peaceful"], supportsColour: true, defaultDurationFrames: 10, gpuCost: "low", audioEffect: { enabled: true, asset: "/audio/flash.wav", volume: 0.3 }
  }),
  createPreset({
    id: "light_sweep", name: "Light Sweep", category: "light", engine: "overlay",
    keywords: ["beauty", "cinematic", "product"], emotions: ["happy"]
  }),
  createPreset({
    id: "sunlight_burst", name: "Sunlight Burst", category: "light", engine: "overlay",
    keywords: ["sunset", "nature", "happy"], emotions: ["happy", "peaceful"]
  }),
  createPreset({
    id: "glow_dissolve", name: "Glow Dissolve", category: "light", engine: "fade",
    keywords: ["temple", "spiritual", "wedding"], emotions: ["peaceful", "romantic"], gpuCost: "medium"
  }),
  createPreset({
    id: "neon_flash", name: "Neon Flash", category: "light", engine: "fade",
    keywords: ["cyber", "music", "nightlife"], emotions: ["happy"], supportsColour: true, defaultDurationFrames: 8, gpuCost: "medium"
  }),
  createPreset({
    id: "prism_light", name: "Prism Light", category: "light", engine: "overlay",
    keywords: ["cinematic", "art"], emotions: ["happy"], gpuCost: "medium"
  }),
  createPreset({
    id: "light_rays_blend", name: "Light Rays Blend", category: "light", engine: "overlay",
    keywords: ["temple", "spiritual", "nature"], emotions: ["peaceful"], gpuCost: "high"
  }),

  // --- CATEGORY 8: Shapes Reveal (71-80) ---
  createPreset({
    id: "circle_reveal", name: "Circle Reveal", category: "shapes", engine: "mask",
    keywords: ["kids", "education", "social media"], emotions: ["happy"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.2 }
  }),
  createPreset({
    id: "circle_close", name: "Circle Close", category: "shapes", engine: "mask",
    keywords: ["kids", "cartoon"], emotions: ["neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "square_reveal", name: "Square Reveal", category: "shapes", engine: "mask",
    keywords: ["infographic", "list"], emotions: ["neutral"]
  }),
  createPreset({
    id: "triangle_reveal", name: "Triangle Reveal", category: "shapes", engine: "mask",
    keywords: ["creative", "modern"], emotions: ["happy"]
  }),
  createPreset({
    id: "diamond_reveal", name: "Diamond Reveal", category: "shapes", engine: "mask",
    keywords: ["wedding", "beauty"], emotions: ["happy", "romantic"]
  }),
  createPreset({
    id: "star_reveal", name: "Star Reveal", category: "shapes", engine: "mask",
    keywords: ["kids", "celebration", "magic"], emotions: ["happy"], audioEffect: { enabled: true, asset: "/audio/sparkle.wav", volume: 0.3 }
  }),
  createPreset({
    id: "line_wipe", name: "Line Wipe", category: "shapes", engine: "mask",
    keywords: ["presentation", "list"], emotions: ["neutral"]
  }),
  createPreset({
    id: "grid_reveal", name: "Grid Reveal", category: "shapes", engine: "mask",
    keywords: ["technology", "modern"], emotions: ["happy"], gpuCost: "medium"
  }),
  createPreset({
    id: "hexagon_reveal", name: "Hexagon Reveal", category: "shapes", engine: "mask",
    keywords: ["technology", "cyber"], emotions: ["happy"], gpuCost: "medium"
  }),
  createPreset({
    id: "polygon_mask", name: "Polygon Mask", category: "shapes", engine: "mask",
    keywords: ["creative", "abstract"], emotions: ["neutral"]
  }),

  // --- CATEGORY 9: Wipe Transitions (81-90) ---
  createPreset({
    id: "wipe_left", name: "Wipe Left", category: "wipe", engine: "wipe", supportsDirection: true,
    keywords: ["travel", "history"], emotions: ["neutral"]
  }),
  createPreset({
    id: "wipe_right", name: "Wipe Right", category: "wipe", engine: "wipe", supportsDirection: true,
    keywords: ["travel", "history"], emotions: ["neutral"]
  }),
  createPreset({
    id: "wipe_up", name: "Wipe Up", category: "wipe", engine: "wipe", supportsDirection: true,
    keywords: ["travel", "cooking"], emotions: ["neutral"]
  }),
  createPreset({
    id: "wipe_down", name: "Wipe Down", category: "wipe", engine: "wipe", supportsDirection: true,
    keywords: ["travel", "cooking"], emotions: ["neutral"]
  }),
  createPreset({
    id: "diagonal_wipe", name: "Diagonal Wipe", category: "wipe", engine: "wipe",
    keywords: ["creative", "vlog"], emotions: ["happy"]
  }),
  createPreset({
    id: "soft_edge_wipe", name: "Soft Edge Wipe", category: "wipe", engine: "wipe",
    keywords: ["travel", "history", "documentary"], emotions: ["peaceful"]
  }),
  createPreset({
    id: "brush_wipe", name: "Brush Wipe", category: "wipe", engine: "wipe",
    keywords: ["art", "creative"], emotions: ["happy"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.25 }
  }),
  createPreset({
    id: "ink_wipe", name: "Ink Wipe", category: "wipe", engine: "wipe",
    keywords: ["art", "history", "documentary"], emotions: ["sad", "peaceful"], gpuCost: "medium"
  }),
  createPreset({
    id: "paint_wipe", name: "Paint Wipe", category: "wipe", engine: "wipe",
    keywords: ["art", "creative"], emotions: ["happy"], gpuCost: "medium"
  }),
  createPreset({
    id: "gradient_wipe", name: "Gradient Wipe", category: "wipe", engine: "wipe",
    keywords: ["cinematic", "before-after"], emotions: ["neutral"], gpuCost: "medium"
  }),

  // --- CATEGORY 10: Spin and Rotate Transitions (91-100) ---
  createPreset({
    id: "spin_clockwise", name: "Spin Clockwise", category: "rotation", engine: "rotation",
    keywords: ["fun", "kids", "celebration"], emotions: ["happy"], audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.3 }
  }),
  createPreset({
    id: "spin_counter_clockwise", name: "Spin Counter-Clockwise", category: "rotation", engine: "rotation",
    keywords: ["fun", "kids"], emotions: ["happy"], audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.3 }
  }),
  createPreset({
    id: "half_spin", name: "Half Spin", category: "rotation", engine: "rotation",
    keywords: ["energetic", "celebration"], emotions: ["happy"]
  }),
  createPreset({
    id: "fast_spin", name: "Fast Spin", category: "rotation", engine: "rotation",
    keywords: ["energetic", "music"], emotions: ["happy"], supportedPace: ["fast"], audioEffect: { enabled: true, asset: "/audio/whoosh-fast.wav", volume: 0.4 }
  }),
  createPreset({
    id: "smooth_rotation", name: "Smooth Rotation", category: "rotation", engine: "rotation",
    keywords: ["cinematic", "creative"], emotions: ["peaceful"]
  }),
  createPreset({
    id: "cube_rotate", name: "Cube Rotate", category: "rotation", engine: "rotation",
    keywords: ["presentation", "technology"], emotions: ["neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "card_flip", name: "Card Flip", category: "rotation", engine: "rotation",
    keywords: ["presentation", "education", "list"], emotions: ["neutral"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.2 }
  }),
  createPreset({
    id: "page_rotate", name: "Page Rotate", category: "rotation", engine: "rotation",
    keywords: ["education", "history", "biography"], emotions: ["neutral"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/page-flip.wav", volume: 0.25 }
  }),
  createPreset({
    id: "3d_rotation", name: "3D Rotation", category: "rotation", engine: "rotation",
    keywords: ["technology", "modern"], emotions: ["happy"], gpuCost: "medium"
  }),
  createPreset({
    id: "spiral_transition", name: "Spiral Transition", category: "rotation", engine: "rotation",
    keywords: ["magic", "dream"], emotions: ["happy"], gpuCost: "high"
  }),

  // --- CATEGORY 11: Cinematic Transitions (101-110) ---
  createPreset({
    id: "cinematic_black_bar", name: "Cinematic Black Bar", category: "cinematic", engine: "overlay",
    keywords: ["movie", "cinematic", "epic"], emotions: ["sad", "peaceful"], gpuCost: "low"
  }),
  createPreset({
    id: "film_burn", name: "Film Burn", category: "cinematic", engine: "overlay",
    keywords: ["movie", "history", "vintage"], emotions: ["happy", "sad"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.3 }
  }),
  createPreset({
    id: "film_strip", name: "Film Strip", category: "cinematic", engine: "overlay",
    keywords: ["movie", "documentary", "history"], emotions: ["peaceful"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/page-flip.wav", volume: 0.2 }
  }),
  createPreset({
    id: "anamorphic_flare", name: "Anamorphic Flare", category: "cinematic", engine: "overlay",
    keywords: ["movie", "cinematic", "epic"], emotions: ["happy", "surprised"], gpuCost: "medium"
  }),
  createPreset({
    id: "cinematic_flash", name: "Cinematic Flash", category: "cinematic", engine: "fade",
    keywords: ["movie", "dramatic", "epic"], emotions: ["surprised"], defaultDurationFrames: 10, gpuCost: "low", audioEffect: { enabled: true, asset: "/audio/flash.wav", volume: 0.35 }
  }),
  createPreset({
    id: "slow_shutter_blend", name: "Slow Shutter Blend", category: "cinematic", engine: "fade",
    keywords: ["movie", "biography"], emotions: ["sad", "peaceful"], gpuCost: "medium"
  }),
  createPreset({
    id: "film_gate", name: "Film Gate", category: "cinematic", engine: "overlay",
    keywords: ["movie", "vintage", "documentary"], emotions: ["sad"], gpuCost: "medium"
  }),
  createPreset({
    id: "vintage_reel", name: "Vintage Reel", category: "cinematic", engine: "overlay",
    keywords: ["history", "biography", "vintage"], emotions: ["sad", "peaceful"], gpuCost: "medium"
  }),
  createPreset({
    id: "grain_dissolve", name: "Grain Dissolve", category: "cinematic", engine: "fade",
    keywords: ["movie", "documentary"], emotions: ["neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "epic_reveal", name: "Epic Reveal", category: "cinematic", engine: "zoom",
    keywords: ["movie", "epic", "dramatic"], emotions: ["happy", "surprised"], defaultDurationFrames: 24, gpuCost: "high", audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.4 }
  }),

  // --- CATEGORY 12: Particle Transitions (111-120) ---
  createPreset({
    id: "spark_transition", name: "Spark Transition", category: "particles", engine: "particle",
    keywords: ["celebration", "magic", "festival"], emotions: ["happy"], gpuCost: "high", audioEffect: { enabled: true, asset: "/audio/sparkle.wav", volume: 0.3 }
  }),
  createPreset({
    id: "fire_particle", name: "Fire Particle", category: "particles", engine: "particle",
    keywords: ["fire", "destruction", "action"], emotions: ["fearful"], gpuCost: "high", audioEffect: { enabled: true, asset: "/audio/whoosh-fast.wav", volume: 0.3 }
  }),
  createPreset({
    id: "smoke_particle", name: "Smoke Particle", category: "particles", engine: "particle",
    keywords: ["destruction", "mystery", "action"], emotions: ["fearful", "sad"], gpuCost: "high"
  }),
  createPreset({
    id: "dust_transition", name: "Dust Transition", category: "particles", engine: "particle",
    keywords: ["history", "vintage", "documentary"], emotions: ["peaceful", "sad"], gpuCost: "medium"
  }),
  createPreset({
    id: "snow_particle", name: "Snow Particle", category: "particles", engine: "particle",
    keywords: ["snow", "winter", "nature"], emotions: ["happy", "peaceful"], gpuCost: "high"
  }),
  createPreset({
    id: "rain_particle", name: "Rain Particle", category: "particles", engine: "particle",
    keywords: ["rain", "storm", "nature"], emotions: ["sad", "fearful"], gpuCost: "high"
  }),
  createPreset({
    id: "glitter_transition", name: "Glitter Transition", category: "particles", engine: "particle",
    keywords: ["celebration", "beauty", "magic"], emotions: ["happy", "romantic"], gpuCost: "high", audioEffect: { enabled: true, asset: "/audio/sparkle.wav", volume: 0.25 }
  }),
  createPreset({
    id: "confetti_transition", name: "Confetti Transition", category: "particles", engine: "particle",
    keywords: ["celebration", "festival", "happy"], emotions: ["happy"], gpuCost: "high", audioEffect: { enabled: true, asset: "/audio/sparkle.wav", volume: 0.3 }
  }),
  createPreset({
    id: "ash_transition", name: "Ash Transition", category: "particles", engine: "particle",
    keywords: ["destruction", "sad"], emotions: ["sad"], gpuCost: "high"
  }),
  createPreset({
    id: "magic_particle", name: "Magic Particle", category: "particles", engine: "particle",
    keywords: ["magic", "kids", "creative"], emotions: ["happy", "surprised"], gpuCost: "high", audioEffect: { enabled: true, asset: "/audio/sparkle.wav", volume: 0.3 }
  }),

  // --- CATEGORY 13: Distortion Transitions (121-130) ---
  createPreset({
    id: "wave_distortion", name: "Wave Distortion", category: "distortion", engine: "distortion",
    keywords: ["water", "dream", "surreal"], emotions: ["surprised"], gpuCost: "medium"
  }),
  createPreset({
    id: "ripple_transition", name: "Ripple Transition", category: "distortion", engine: "distortion",
    keywords: ["water", "beach", "nature"], emotions: ["peaceful"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.2 }
  }),
  createPreset({
    id: "liquid_warp", name: "Liquid Warp", category: "distortion", engine: "distortion",
    keywords: ["surreal", "dream", "mystery"], emotions: ["surprised"], gpuCost: "high"
  }),
  createPreset({
    id: "heat_wave", name: "Heat Wave", category: "distortion", engine: "distortion",
    keywords: ["heat", "summer", "destruction"], emotions: ["fearful", "neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "glass_distortion", name: "Glass Distortion", category: "distortion", engine: "distortion",
    keywords: ["creative", "modern", "hacker"], emotions: ["surprised"], gpuCost: "medium"
  }),
  createPreset({
    id: "mirror_warp", name: "Mirror Warp", category: "distortion", engine: "distortion",
    keywords: ["surreal", "mystery"], emotions: ["surprised"], gpuCost: "medium"
  }),
  createPreset({
    id: "stretch_transition", name: "Stretch Transition", category: "distortion", engine: "distortion",
    keywords: ["creative", "vlog"], emotions: ["happy"]
  }),
  createPreset({
    id: "fisheye_transition", name: "Fisheye Transition", category: "distortion", engine: "distortion",
    keywords: ["creative", "vlog", "sports"], emotions: ["happy"]
  }),
  createPreset({
    id: "lens_warp", name: "Lens Warp", category: "distortion", engine: "distortion",
    keywords: ["creative", "modern"], emotions: ["neutral"]
  }),
  createPreset({
    id: "melt_transition", name: "Melt Transition", category: "distortion", engine: "distortion",
    keywords: ["surreal", "dream", "error"], emotions: ["sad", "fearful"], gpuCost: "high"
  }),

  // --- CATEGORY 14: Social Media Transitions (131-140) ---
  createPreset({
    id: "vertical_swipe", name: "Vertical Swipe", category: "social", engine: "slide", supportsDirection: true,
    keywords: ["shorts", "reels", "trending"], emotions: ["happy"], audioEffect: { enabled: true, asset: "/audio/swipe.wav", volume: 0.3 }
  }),
  createPreset({
    id: "reel_swipe", name: "Reel Swipe", category: "social", engine: "slide", supportsDirection: true,
    keywords: ["reels", "viral"], emotions: ["happy"], audioEffect: { enabled: true, asset: "/audio/swipe.wav", volume: 0.3 }
  }),
  createPreset({
    id: "shorts_snap", name: "Shorts Snap", category: "social", engine: "zoom",
    keywords: ["shorts", "trending"], emotions: ["happy"], defaultDurationFrames: 8, audioEffect: { enabled: true, asset: "/audio/whoosh-fast.wav", volume: 0.3 }
  }),
  createPreset({
    id: "tiktok_style_zoom", name: "TikTok Style Zoom", category: "social", engine: "zoom",
    keywords: ["viral", "reaction", "influencer"], emotions: ["surprised"], defaultDurationFrames: 10, gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh-fast.wav", volume: 0.35 }
  }),
  createPreset({
    id: "emoji_pop", name: "Emoji Pop", category: "social", engine: "overlay",
    keywords: ["kids", "fun", "social"], emotions: ["happy"], audioEffect: { enabled: true, asset: "/audio/swipe.wav", volume: 0.3 }
  }),
  createPreset({
    id: "social_card_slide", name: "Social Card Slide", category: "social", engine: "slide",
    keywords: ["social", "presentation"], emotions: ["happy"]
  }),
  createPreset({
    id: "caption_bounce", name: "Caption Bounce", category: "social", engine: "push",
    keywords: ["trending", "viral"], emotions: ["happy"]
  }),
  createPreset({
    id: "split_screen_swipe", name: "Split Screen Swipe", category: "social", engine: "slide",
    keywords: ["shorts", "reels", "comparison"], emotions: ["happy"], gpuCost: "medium"
  }),
  createPreset({
    id: "mobile_scroll", name: "Mobile Scroll", category: "social", engine: "slide",
    keywords: ["social", "trending"], emotions: ["neutral"]
  }),
  createPreset({
    id: "quick_snap_cut", name: "Quick Snap Cut", category: "social", engine: "fade",
    keywords: ["shorts", "viral", "fast"], emotions: ["happy", "surprised"], defaultDurationFrames: 5, gpuCost: "low"
  }),

  // --- CATEGORY 15: Action Transitions (141-150) ---
  createPreset({
    id: "camera_shake", name: "Camera Shake", category: "action", engine: "distortion",
    keywords: ["action", "sports", "intense"], emotions: ["surprised"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/impact.wav", volume: 0.4 }
  }),
  createPreset({
    id: "impact_flash", name: "Impact Flash", category: "action", engine: "fade",
    keywords: ["action", "fight", "intense"], emotions: ["surprised"], defaultDurationFrames: 6, gpuCost: "low", audioEffect: { enabled: true, asset: "/audio/impact.wav", volume: 0.45 }
  }),
  createPreset({
    id: "whip_pan_left", name: "Whip Pan Left", category: "action", engine: "blur", supportsDirection: true,
    keywords: ["action", "sports", "fast"], emotions: ["neutral"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh-fast.wav", volume: 0.35 }
  }),
  createPreset({
    id: "whip_pan_right", name: "Whip Pan Right", category: "action", engine: "blur", supportsDirection: true,
    keywords: ["action", "sports", "fast"], emotions: ["neutral"], gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh-fast.wav", volume: 0.35 }
  }),
  createPreset({
    id: "speed_ramp_cut", name: "Speed Ramp Cut", category: "action", engine: "zoom",
    keywords: ["action", "sports", "trending"], emotions: ["surprised"], defaultDurationFrames: 10, gpuCost: "medium", audioEffect: { enabled: true, asset: "/audio/whoosh.wav", volume: 0.3 }
  }),
  createPreset({
    id: "punch_zoom", name: "Punch Zoom", category: "action", engine: "zoom",
    keywords: ["action", "intense", "dramatic"], emotions: ["surprised"], defaultDurationFrames: 8, audioEffect: { enabled: true, asset: "/audio/impact.wav", volume: 0.35 }
  }),
  createPreset({
    id: "explosion_flash", name: "Explosion Flash", category: "action", engine: "fade",
    keywords: ["explosion", "destruction", "fight"], emotions: ["fearful", "surprised"], defaultDurationFrames: 8, gpuCost: "low", audioEffect: { enabled: true, asset: "/audio/impact.wav", volume: 0.5 }
  }),
  createPreset({
    id: "action_blur", name: "Action Blur", category: "action", engine: "blur",
    keywords: ["action", "sports"], emotions: ["neutral"], gpuCost: "medium"
  }),
  createPreset({
    id: "shockwave", name: "Shockwave", category: "action", engine: "distortion",
    keywords: ["action", "explosion", "magic"], emotions: ["surprised"], gpuCost: "high", audioEffect: { enabled: true, asset: "/audio/impact.wav", volume: 0.4 }
  }),
  createPreset({
    id: "rapid_cut_burst", name: "Rapid Cut Burst", category: "action", engine: "fade",
    keywords: ["action", "intense", "urgent"], emotions: ["surprised"], defaultDurationFrames: 12, gpuCost: "medium"
  })
];

export const transitionPresetsMap = new Map<string, TransitionPreset>(
  transitionPresets.map(preset => [preset.id, preset])
);
