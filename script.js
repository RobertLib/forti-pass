class PasswordGenerator {
  constructor() {
    this.characters = {
      uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      lowercase: "abcdefghijklmnopqrstuvwxyz",
      numbers: "0123456789",
      symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
    };

    this.init();
  }

  init() {
    this.lengthInput = document.getElementById("length");
    this.countInput = document.getElementById("count");
    this.uppercaseCheckbox = document.getElementById("uppercase");
    this.lowercaseCheckbox = document.getElementById("lowercase");
    this.numbersCheckbox = document.getElementById("numbers");
    this.symbolsCheckbox = document.getElementById("symbols");
    this.generateBtn = document.getElementById("generateBtn");
    this.passwordList = document.getElementById("passwordList");
    this.strengthBar = document.getElementById("strengthBar");
    this.strengthText = document.getElementById("strengthText");

    this.setupEventListeners();
    this.generatePasswords(); // Generate initial passwords
  }

  setupEventListeners() {
    this.generateBtn.addEventListener("click", () => this.generatePasswords());

    // Auto-generate when settings change
    [
      this.lengthInput,
      this.countInput,
      this.uppercaseCheckbox,
      this.lowercaseCheckbox,
      this.numbersCheckbox,
      this.symbolsCheckbox,
    ].forEach((element) => {
      element.addEventListener("change", () => this.generatePasswords());
    });

    // Prevent form submission on Enter key
    [this.lengthInput, this.countInput].forEach((input) => {
      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.generatePasswords();
        }
      });
    });
  }

  getCharacterSet() {
    let charset = "";

    if (this.uppercaseCheckbox.checked) {
      charset += this.characters.uppercase;
    }
    if (this.lowercaseCheckbox.checked) {
      charset += this.characters.lowercase;
    }
    if (this.numbersCheckbox.checked) {
      charset += this.characters.numbers;
    }
    if (this.symbolsCheckbox.checked) {
      charset += this.characters.symbols;
    }

    return charset;
  }

  generateSinglePassword(length, charset) {
    if (charset.length === 0) {
      return "Please select at least one character type";
    }

    let password = "";

    // Ensure at least one character from each selected type
    if (this.uppercaseCheckbox.checked) {
      password += this.getRandomChar(this.characters.uppercase);
    }
    if (this.lowercaseCheckbox.checked) {
      password += this.getRandomChar(this.characters.lowercase);
    }
    if (this.numbersCheckbox.checked) {
      password += this.getRandomChar(this.characters.numbers);
    }
    if (this.symbolsCheckbox.checked) {
      password += this.getRandomChar(this.characters.symbols);
    }

    // Fill the rest of the password
    for (let i = password.length; i < length; i++) {
      password += this.getRandomChar(charset);
    }

    // Shuffle the password to avoid predictable patterns
    return this.shuffleString(password);
  }

  getRandomChar(charset) {
    return charset.charAt(Math.floor(Math.random() * charset.length));
  }

  shuffleString(str) {
    return str
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  generatePasswords() {
    const length = parseInt(this.lengthInput.value);
    const count = parseInt(this.countInput.value);
    const charset = this.getCharacterSet();

    // Validate inputs
    if (length < 4 || length > 128) {
      this.showError("Password length must be between 4 and 128 characters");
      return;
    }

    if (count < 1 || count > 50) {
      this.showError("Number of passwords must be between 1 and 50");
      return;
    }

    if (charset.length === 0) {
      this.showError("Please select at least one character type");
      return;
    }

    const passwords = [];
    for (let i = 0; i < count; i++) {
      passwords.push(this.generateSinglePassword(length, charset));
    }

    this.displayPasswords(passwords);
    this.updateStrengthIndicator(passwords[0], charset);
  }

  displayPasswords(passwords) {
    this.passwordList.innerHTML = "";

    passwords.forEach((password, index) => {
      const passwordItem = document.createElement("div");
      passwordItem.className = "password-item";

      const escapedPassword = this.escapeHtml(password);
      const escapedPasswordForJs = password.replace(/'/g, "\\'");

      passwordItem.innerHTML = `
        <span class="password-text">${escapedPassword}</span>
        <button class="copy-btn" onclick="passwordGen.copyPassword('${escapedPasswordForJs}', this)">
          Copy
        </button>
      `;

      this.passwordList.appendChild(passwordItem);
    });
  }

  async copyPassword(password, button) {
    try {
      await navigator.clipboard.writeText(password);

      const originalText = button.textContent;
      button.textContent = "Copied!";
      button.classList.add("copied");

      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove("copied");
      }, 2000);
    } catch (err) {
      console.error("Failed to copy password:", err);
      this.showError("Failed to copy password to clipboard");
    }
  }

  updateStrengthIndicator(password, charset) {
    const strength = this.calculatePasswordStrength(password, charset);

    const strengthBar = this.strengthBar;
    const strengthText = this.strengthText;

    let color, text, width;

    if (strength >= 90) {
      color = "#27ae60";
      text = "Very Strong";
      width = "100%";
    } else if (strength >= 70) {
      color = "#2ecc71";
      text = "Strong";
      width = "80%";
    } else if (strength >= 50) {
      color = "#f39c12";
      text = "Moderate";
      width = "60%";
    } else if (strength >= 30) {
      color = "#e67e22";
      text = "Weak";
      width = "40%";
    } else {
      color = "#e74c3c";
      text = "Very Weak";
      width = "20%";
    }

    strengthBar.style.setProperty("--strength-width", width);
    strengthBar.style.setProperty("--strength-color", color);
    strengthText.style.setProperty("--strength-color", color);
    strengthText.textContent = text;
  }

  calculatePasswordStrength(password, charset) {
    let score = 0;
    const length = password.length;

    // Length scoring
    if (length >= 12) score += 25;
    else if (length >= 8) score += 15;
    else if (length >= 6) score += 10;
    else score += 5;

    // Character variety scoring
    if (this.uppercaseCheckbox.checked) score += 15;
    if (this.lowercaseCheckbox.checked) score += 15;
    if (this.numbersCheckbox.checked) score += 15;
    if (this.symbolsCheckbox.checked) score += 20;

    // Bonus for longer passwords
    if (length >= 16) score += 10;
    if (length >= 20) score += 10;

    // Entropy bonus
    const entropy = length * Math.log2(charset.length);
    if (entropy >= 60) score += 10;

    return Math.min(100, score);
  }

  showError(message) {
    // Create temporary error message
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #e74c3c;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      z-index: 1000;
      box-shadow: 0 4px 15px rgba(231, 76, 60, 0.3);
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(errorDiv);

    setTimeout(() => {
      errorDiv.remove();
    }, 3000);
  }
}

// Add CSS for error message animation
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);

// Initialize the password generator when the page loads
let passwordGen;
document.addEventListener("DOMContentLoaded", () => {
  passwordGen = new PasswordGenerator();
});
