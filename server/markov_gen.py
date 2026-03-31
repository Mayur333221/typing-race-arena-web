import sys, pickle, random, json

def generate(pkl_path, min_words):
    with open(pkl_path, "rb") as f:
        model = pickle.load(f)
    sentences = []
    total = 0
    for _ in range(200):
        if total >= min_words:
            break
        try:
            s = model.make_sentence(tries=100)
            if s:
                sentences.append(s)
                total += len(s.split())
        except Exception:
            print()
    if not sentences:
        return
    
    print(json.dumps({
        "text": " ".join(sentences).strip()
    }))

if __name__ == "__main__":
    pkl = sys.argv[1]
    min_w = int(sys.argv[2]) if len(sys.argv) > 2 else 45
    generate(pkl, min_w)