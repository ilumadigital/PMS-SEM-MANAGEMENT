# 1. Χρησιμοποιούμε την ίδια ελαφριά έκδοση Node.js
FROM node:20-alpine

# 2. Ορίζουμε τον φάκελο εργασίας μέσα στο container
WORKDIR /app

# 3. Αντιγράφουμε τα αρχεία των ρυθμίσεων
COPY package*.json ./

# 4. Εγκαθιστούμε τα dependencies του Node.js (Express, Bcrypt, MariaDB κλπ)
RUN npm install

# 5. Αντιγράφουμε τον κώδικα του backend
COPY . .

# 6. Ανοίγουμε την πόρτα του API (Port 5000)
EXPOSE 5000

# 7. Ξεκινάμε τον server σε development mode (π.χ. με nodemon)
CMD ["npm", "run", "dev"]