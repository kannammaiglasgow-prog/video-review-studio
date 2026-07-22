import os
import sys
import json
import time
import logging
from flask import Flask, request, jsonify

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("media-worker")

app = Flask(__name__)

# Global model holders
clip_model = None
clip_processor = None
ocr_reader = None
whisper_model = None
florence_model = None
florence_processor = None
parler_model = None
parler_prompt_tokenizer = None
parler_desc_tokenizer = None

# Cache paths
MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "models")
os.environ["HF_HOME"] = os.path.join(MODELS_DIR, "huggingface")

# Device detection
import torch
device = "cuda" if torch.cuda.is_available() else "cpu"
if device == "cpu":
    torch.set_num_threads(4)
    logger.info("Set torch CPU threads to 4 for optimized local inference")
logger.info(f"Using system device: {device}")

# Monkeypatch transformers to avoid compatibility issues with Florence-2 remote code
try:
    import transformers
    if hasattr(transformers, "PreTrainedModel"):
        transformers.PreTrainedModel._supports_sdpa = True
        logger.info("Monkeypatched transformers.PreTrainedModel._supports_sdpa = True")
except Exception as patch_err:
    logger.warning(f"Could not monkeypatch transformers: {patch_err}")

import threading

model_locks = {
    "clip": threading.Lock(),
    "florence": threading.Lock(),
    "ocr": threading.Lock(),
    "whisper": threading.Lock(),
    "parler": threading.Lock()
}

def get_clip():
    global clip_model, clip_processor
    with model_locks["clip"]:
        if clip_model is None:
            try:
                from transformers import CLIPProcessor, CLIPModel
                logger.info("Loading CLIP model: openai/clip-vit-base-patch32...")
                clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
                clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
                clip_model.to(device)
                logger.info("CLIP model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load CLIP: {e}")
    return clip_model, clip_processor

def get_florence():
    global florence_model, florence_processor
    with model_locks["florence"]:
        if florence_model is None:
            try:
                from transformers import AutoProcessor, AutoModelForCausalLM, AutoConfig
                logger.info("Loading Florence-2 model: microsoft/Florence-2-base...")
                
                # Patch config to fix missing forced_bos_token_id in newer transformers versions
                config = AutoConfig.from_pretrained("microsoft/Florence-2-base", trust_remote_code=True)
                if hasattr(config, "text_config") and not hasattr(config.text_config, "forced_bos_token_id"):
                    config.text_config.forced_bos_token_id = None
                    logger.info("Patched Florence-2 text_config.forced_bos_token_id")
                
                florence_model = AutoModelForCausalLM.from_pretrained("microsoft/Florence-2-base", config=config, trust_remote_code=True)
                florence_processor = AutoProcessor.from_pretrained("microsoft/Florence-2-base", trust_remote_code=True)
                florence_model.to(device)
                if device == "cpu":
                    florence_model = florence_model.float()
                    logger.info("Cast Florence-2 model parameters to float32 on CPU device.")
                logger.info("Florence-2 model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load Florence-2: {e}")
                import traceback
                traceback.print_exc()
    return florence_model, florence_processor

def get_ocr():
    global ocr_reader
    with model_locks["ocr"]:
        if ocr_reader is None:
            try:
                import easyocr
                logger.info("Loading EasyOCR reader...")
                ocr_reader = easyocr.Reader(['en', 'ta'], gpu=(device == "cuda"))
                logger.info("EasyOCR loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load EasyOCR: {e}")
    return ocr_reader

def get_whisper():
    global whisper_model
    with model_locks["whisper"]:
        if whisper_model is None:
            try:
                from faster_whisper import WhisperModel
                logger.info("Loading Whisper Model (tiny)...")
                whisper_model = WhisperModel("tiny", device=device, compute_type="float32" if device == "cpu" else "float16")
                logger.info("Whisper loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load Whisper: {e}")
    return whisper_model

def get_parler():
    global parler_model, parler_prompt_tokenizer, parler_desc_tokenizer
    with model_locks["parler"]:
        if parler_model is None:
            try:
                from parler_tts import ParlerTTSForConditionalGeneration
                from transformers import AutoTokenizer
                model_id = "ai4bharat/indic-parler-tts"
                logger.info(f"Loading Indic Parler-TTS model: {model_id}...")
                parler_model = ParlerTTSForConditionalGeneration.from_pretrained(model_id).to(device)
                parler_prompt_tokenizer = AutoTokenizer.from_pretrained(model_id)
                parler_desc_tokenizer = AutoTokenizer.from_pretrained(parler_model.config.text_encoder._name_or_path)
                logger.info("Indic Parler-TTS loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load Indic Parler-TTS: {e}")
                import traceback
                traceback.print_exc()
    return parler_model, parler_prompt_tokenizer, parler_desc_tokenizer

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "device": device,
        "cuda_available": torch.cuda.is_available()
    })

@app.route("/detect-scenes", methods=["POST"])
def detect_scenes_endpoint():
    try:
        body = request.json or {}
        video_path = body.get("videoPath")
        threshold = float(body.get("threshold", 0.35))
        min_scene_len = float(body.get("minSceneLen", 2.0))
        
        if not video_path or not os.path.exists(video_path):
            return jsonify({"error": "Video path not found"}), 400

        import cv2
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if fps <= 0:
            fps = 30.0
        
        min_frames = int(min_scene_len * fps)
        scenes = []
        prev_hist = None
        frame_idx = 0
        last_cut = 0
        
        # Step through video frames (sampling every 2nd frame for speed)
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            if frame_idx % 2 == 0:
                small = cv2.resize(frame, (160, 90))
                hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
                hist = cv2.calcHist([hsv], [0, 1], None, [8, 8], [0, 180, 0, 256])
                cv2.normalize(hist, hist)
                
                if prev_hist is not None:
                    diff = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL)
                    if diff < (1.0 - threshold) and (frame_idx - last_cut) >= min_frames:
                        scenes.append({
                            "start": float(last_cut / fps),
                            "end": float(frame_idx / fps),
                            "duration": float((frame_idx - last_cut) / fps)
                        })
                        last_cut = frame_idx
                prev_hist = hist
            frame_idx += 1
            
        cap.release()
        
        duration = float(frame_idx / fps)
        # Append final segment
        if (frame_idx - last_cut) >= min_frames or len(scenes) == 0:
            scenes.append({
                "start": float(last_cut / fps),
                "end": duration,
                "duration": float(duration - (last_cut / fps))
            })
        else:
            if len(scenes) > 0:
                scenes[-1]["end"] = duration
                scenes[-1]["duration"] = float(duration - scenes[-1]["start"])
                
        return jsonify({"scenes": scenes})
    except Exception as e:
        logger.error(f"Scene detection error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/embed-text", methods=["POST"])
def embed_text():
    try:
        body = request.json or {}
        text = body.get("text", "").strip()
        if not text:
            return jsonify({"error": "Empty text"}), 400
            
        model, processor = get_clip()
        if model is None:
            return jsonify({"error": "CLIP model not available"}), 500
            
        inputs = processor(text=[text], return_tensors="pt", padding=True)
        inputs = {k: v.to(device) for k, v in inputs.items()}
        with torch.no_grad():
            text_features = model.get_text_features(**inputs)
            if hasattr(text_features, "text_embeds"):
                text_features = text_features.text_embeds
            elif not isinstance(text_features, torch.Tensor):
                if hasattr(text_features, "pooler_output"):
                    text_features = text_features.pooler_output
                else:
                    text_features = text_features[1]
            
            # Normalize embedding
            text_features = text_features / text_features.norm(p=2, dim=-1, keepdim=True)
            vector = text_features[0].cpu().numpy().tolist()
            
        return jsonify({"vector": vector})
    except Exception as e:
        logger.error(f"Text embedding error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/analyze-media", methods=["POST"])
def analyze_media():
    try:
        body = request.json or {}
        image_path = body.get("imagePath")
        mode = body.get("mode", "eco") # eco, balanced, quality
        
        if not image_path or not os.path.exists(image_path):
            return jsonify({"error": "Image path not found"}), 400
        
        from PIL import Image
        img = Image.open(image_path).convert("RGB")
        
        # 1. Generate CLIP Embeddings
        vector = []
        clip_m, clip_p = get_clip()
        if clip_m is not None:
            try:
                inputs = clip_p(images=img, return_tensors="pt")
                inputs = {k: v.to(device) for k, v in inputs.items()}
                with torch.no_grad():
                    image_features = clip_m.get_image_features(**inputs)
                    if hasattr(image_features, "image_embeds"):
                        image_features = image_features.image_embeds
                    elif not isinstance(image_features, torch.Tensor):
                        if hasattr(image_features, "pooler_output"):
                            image_features = image_features.pooler_output
                        else:
                            image_features = image_features[1]
                    
                    image_features = image_features / image_features.norm(p=2, dim=-1, keepdim=True)
                    vector = image_features[0].cpu().numpy().tolist()
            except Exception as clip_err:
                logger.error(f"CLIP embedding failed: {clip_err}")

        # 2. Florence-2 Visual analysis (Balanced / Quality modes)
        description = ""
        tags = []
        objects = []
        if mode in ["balanced", "quality"]:
            flor_m, flor_p = get_florence()
            if flor_m is not None:
                try:
                    # Captioning: Use faster/shorter CAPTION for balanced mode, DETAILED_CAPTION for quality
                    task_prompt = "<DETAILED_CAPTION>" if mode == "quality" else "<CAPTION>"
                    beams = 3 if mode == "quality" else 1
                    inputs = flor_p(text=task_prompt, images=img, return_tensors="pt")
                    inputs = {k: v.to(device) for k, v in inputs.items()}
                    generated_ids = flor_m.generate(
                        input_ids=inputs["input_ids"],
                        pixel_values=inputs["pixel_values"],
                        max_new_tokens=128,
                        num_beams=beams
                    )
                    description = flor_p.batch_decode(generated_ids, skip_special_tokens=True)[0]
                    logger.info(f"Florence captioning result: '{description}'")
                    
                    # Heuristic tag extractor from caption
                    tags = list(set([w.strip(",.!?()").lower() for w in description.split() if len(w) > 4]))
                except Exception as flor_err:
                    logger.error(f"Florence captioning failed: {flor_err}")
                    import traceback
                    traceback.print_exc()

        # Heuristic backup tags
        if not description:
            description = "Local media asset"
            
        # 3. EasyOCR analysis (Balanced / Quality modes)
        ocr_text = ""
        if mode in ["balanced", "quality"]:
            reader = get_ocr()
            if reader is not None:
                try:
                    ocr_results = reader.readtext(image_path, detail=0)
                    ocr_text = " ".join(ocr_results)
                except Exception as ocr_err:
                    logger.error(f"OCR failed: {ocr_err}")

        return jsonify({
            "vector": vector,
            "description": description,
            "tags": tags,
            "ocrText": ocr_text,
            "objects": objects
        })
    except Exception as e:
        logger.error(f"Media analysis error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/transcribe-audio", methods=["POST"])
def transcribe_audio():
    try:
        body = request.json or {}
        video_path = body.get("videoPath")
        if not video_path or not os.path.exists(video_path):
            return jsonify({"error": "Video path not found"}), 400

        whisper = get_whisper()
        if whisper is None:
            return jsonify({"error": "Whisper model not available"}), 500

        segments, info = whisper.transcribe(video_path, beam_size=1)
        transcript = " ".join([seg.text for seg in segments])
        
        return jsonify({
            "transcript": transcript,
            "language": info.language
        })
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return jsonify({"error": str(e)}), 500

def tamil_number_to_words(n):
    units = ["பூஜ்ஜியம்", "ஒன்று", "இரண்டு", "மூன்று", "நான்கு", "ஐந்து", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது"]
    tens = ["", "பத்து", "இருபது", "முப்பது", "நாற்பது", "ஐம்பது", "அறுபது", "எழுபது", "எண்பது", "தொண்ணூறு"]
    teens = ["பத்து", "பதினொன்று", "பன்னிரண்டு", "பதின்மூன்று", "பதினான்கு", "பதினைந்து", "பதினாறு", "பதினேழு", "பதினெட்டு", "பத்தொன்பது"]
    
    if n < 10:
        return units[n]
    elif n < 20:
        return teens[n-10]
    elif n < 100:
        t = n // 10
        u = n % 10
        if u == 0:
            return tens[t]
        else:
            tens_comb = ["", "பத்து", "இருபத்தி", "முப்பத்தி", "நாற்பத்தி", "ஐம்பத்தி", "அறுபத்தி", "எழுபத்தி", "எண்பத்தி", "தொண்ணூற்றி"]
            return tens_comb[t] + " " + units[u]
    elif n < 1000:
        h = n // 100
        rem = n % 100
        hundreds = ["", "நூறு", "இருநூறு", "முந்நூறு", "நானூறு", "ஐந்நூறு", "அறுநூறு", "எழுநூறு", "எண்ணூறு", "தொள்ளாயிரம்"]
        hundreds_comb = ["", "நூற்று", "இருநூற்று", "முந்நூற்று", "நானூற்று", "ஐந்நூற்று", "அறுநூற்று", "எழுநூற்று", "எண்ணூற்று", "தொள்ளாயிரத்து"]
        if rem == 0:
            return hundreds[h]
        else:
            return hundreds_comb[h] + " " + tamil_number_to_words(rem)
    return str(n)

def replace_numbers_with_tamil_words(text):
    import re
    def repl(match):
        num = int(match.group(0))
        if num < 1000:
            return tamil_number_to_words(num)
        return match.group(0)
    return re.sub(r'\d+', repl, text)

@app.route("/generate-tts", methods=["POST"])
def generate_tts_endpoint():
    try:
        body = request.json or {}
        text = body.get("text", "").strip()
        language = body.get("language", "ta")

        # Normalize digits to Tamil words to ensure clear pronunciation by Parler-TTS
        # (only for Tamil output -- English/other languages keep numerals as-is)
        if language == "ta":
            text = replace_numbers_with_tamil_words(text)

        output_path = body.get("outputPath")
        voice_desc = body.get("voiceDescription", "")
        
        if not text or not output_path:
            return jsonify({"error": "Missing text or outputPath"}), 400
            
        model, p_tok, d_tok = get_parler()
        if model is None:
            return jsonify({"error": "Parler-TTS model not available"}), 500
            
        if not voice_desc:
            voice_desc = (
                "Jaya speaks in Tamil in a clear and professional news-reading voice. "
                "She speaks at a moderate speed with a natural and expressive tone. "
                "The recording is very clear and has no background noise."
            )
            
        import soundfile as sf
        import numpy as np
        import sqlite3
        
        project_id = body.get("projectId")
        session_id = body.get("sessionId")
        db_path = "C:/Users/kanna/Documents/Codex/2026-07-12/o/work/video-review-studio/data/review-studio.sqlite"
        
        def write_db_log(step, message, status="running"):
            if not project_id or not session_id:
                return
            try:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT region FROM auto_news_logs WHERE project_id = ? AND region IS NOT NULL LIMIT 1", (project_id,))
                row = cursor.fetchone()
                region = row[0] if row else None
                
                cursor.execute(
                    "INSERT INTO auto_news_logs (session_id, project_id, region, step, message, status) VALUES (?, ?, ?, ?, ?, ?)",
                    (session_id, project_id, region, step, message, status)
                )
                conn.commit()
                conn.close()
            except Exception as e:
                logger.error(f"Failed to write DB log from worker: {e}")

        # Split text into clean sentences/utterances, splitting long clauses by commas to prevent Parler-TTS distortion
        import re
        raw_sentences = [s.strip() for s in re.split(r'[.!?\n]+', text) if s.strip()]
        sentences = []
        for s in raw_sentences:
            if len(s) > 70 and ("," in s or "，" in s):
                # Split on comma, keeping the comma context
                parts = [p.strip() for p in re.split(r'[,，]+', s) if p.strip()]
                sentences.extend(parts)
            else:
                sentences.append(s)

        if not sentences:
            sentences = [text]
            
        logger.info(f"Split script into {len(sentences)} clause(s) for TTS processing.")
        write_db_log("tts", f"🎤 Parler-TTS: {len(sentences)} வாக்கியங்கள் பிரிக்கப்பட்டன...")
        
        description_inputs = d_tok(voice_desc, return_tensors="pt").to(device)

        # 0.25 seconds silence padding between clauses for natural breathing flow
        silence_samples = int(0.25 * model.config.sampling_rate)
        silence_padding = np.zeros(silence_samples, dtype=np.float32)

        combined_audio = []

        for idx, sentence in enumerate(sentences):
            logger.info(f"Processing sentence {idx + 1}/{len(sentences)}: {sentence}")
            write_db_log("tts", f"🎤 Parler-TTS — வாக்கியம் {idx + 1}/{len(sentences)} பேசுகிறது...")
            prompt_inputs = p_tok(sentence, return_tensors="pt").to(device)

            with torch.inference_mode():
                generation = model.generate(
                    input_ids=description_inputs.input_ids,
                    attention_mask=description_inputs.attention_mask,
                    prompt_input_ids=prompt_inputs.input_ids,
                    prompt_attention_mask=prompt_inputs.attention_mask,
                )

            audio_segment = generation.cpu().numpy().squeeze()
            combined_audio.append(audio_segment)

            # Add silence between sentences (but not after the last one)
            if idx < len(sentences) - 1:
                combined_audio.append(silence_padding)
                
        audio = np.concatenate(combined_audio)
        
        # Ensure output folder exists
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        
        sf.write(output_path, audio, model.config.sampling_rate)
        logger.info(f"Generated Indic Parler-TTS audio saved to: {output_path}")
        write_db_log("tts", "✅ Parler-TTS குரல் முழுமையாக உருவாக்கப்பட்டது!", "done")
        
        return jsonify({"success": True, "outputPath": output_path})
    except Exception as e:
        logger.error(f"TTS Generation error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5005
    logger.info(f"Starting Local AI Worker on http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=False)
