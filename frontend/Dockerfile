# 1. Χρησιμοποιούμε μια ελαφριά έκδοση του Node.js
FROM node:20-alpine

# 2. Ορίζουμε τον φάκελο εργασίας μέσα στο container
WORKDIR /app

# 3. Αντιγράφουμε τα αρχεία των ρυθμίσεων
COPY package*.json ./

# 4. Εγκαθιστούμε τα πακέτα ΜΕΣΑ στο container
RUN npm install

# 5. Αντιγράφουμε τον υπόλοιπο κώδικα
COPY . .

# 6. Ανοίγουμε την πόρτα του Vite
EXPOSE 5173

# 7. Ξεκινάμε τον Vite server με host flag για να είναι προσβάσιμος απέξω
CMD ["npm", "run", "dev", "--", "--host"]