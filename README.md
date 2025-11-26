# 🎬 Movie Recommender System  
A content-based movie recommendation system built using **Python**, **Pandas**, **Scikit-Learn**, and **Cosine Similarity**.  
The system recommends movies based on similarity of **genre, overview, cast, crew, and keywords**.

---

## 🚀 Features  
- 🔍 **Search any movie**  
- 🤖 **Get top similar movie recommendations**  
- 📊 **Content-based filtering using cosine similarity**  
- ⚡ Fast lookup using pre-computed `similarity.pkl`  
- 🌐 Simple and interactive app using Flask / Streamlit  

---

## 🛠️ Tech Stack  
### **Machine Learning & Data**
- Python  
- Pandas  
- NumPy  
- Scikit-Learn  
- NLTK (optional)  
- Cosine Similarity  

### **Frontend / Deployment**
- Flask or Streamlit  
- HTML / CSS  
- Render / Vercel / Localhost  

---

## 🧠 How It Works  
1. Load TMDB dataset  
2. Combine important features:
   - Overview  
   - Genres  
   - Keywords  
   - Cast  
   - Crew  
3. Create a single "tags" feature  
4. Convert text → vectors using **CountVectorizer**  
5. Compute similarity using **Cosine Similarity**  
6. Recommend top N similar movies  

---

## 🏁 Getting Started  
### 1️⃣ Clone the repository  
```bash
git clone https://github.com/atharva7471/movie-recommender.git
```

### 2️⃣ Install dependencies  
```bash
pip install -r requirements.txt
```

### 3️⃣ Run the application  
```bash
python app.py
```

App runs on:  
👉 **http://127.0.0.1:5000/**

---

## 📦 Dataset  
This system uses the publicly available **TMDB Movie Dataset** from Kaggle / TMDB API.

---

## ✨ Example Output  
**Input:** Avengers  
**Recommended:**  
- Avengers: Age of Ultron  
- Captain America: Civil War  
- Iron Man 3  
- Guardians of the Galaxy  
- Thor: Ragnarok  

---

## 📧 Contact  
**Atharva Bhosale**  
📍 Pune, Maharashtra  
📩 Email: **atharva7471@gmail.com**  
🔗 Portfolio: https://athoofolio.vercel.app 
🐙 GitHub: https://github.com/atharva7471  
🔗 LinkedIn: https://linkedin.com/in/atharva-bhosale-7471abc  
