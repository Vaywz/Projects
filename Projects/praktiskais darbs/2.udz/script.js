const questionContainer = document.getElementById("question-container");
const questionElement = document.getElementById("question");
const answerButtons = document.getElementById("answer-buttons");
const nextButton = document.getElementById("next-btn");
const restartButton = document.getElementById("restart-btn");
const resultDiv = document.getElementById("result");

let shuffledQuestions, currentQuestionIndex, score;

const questions = [
  {
    question: "Cik skolēnu ir grupā P1-2",
    answers: [
      { text: "29", correct: true },
      { text: "30", correct: false },
      { text: "1", correct: false },
      { text: "28", correct: false },
    ],
  },
  {
    question: "Kur atrodas garākais ūdenskritums Eiropā?",
    answers: [
      { text: "Somijā", correct: false },
      { text: "Latvijā", correct: true },
      { text: "Austrijā", correct: false },
      { text: "Lietuvā", correct: false },
    ],
  },
  {
    question: "Kurā ielā atrodas pie DOMINA?",
    answers: [
      { text: "Lēdmanes ielā 3", correct: false },
      { text: "Bebru iela", correct: false },
      { text: "Āgenskalna iela", correct: false },
      { text: "Braslas ielā 16", correct: true },
    ],
  },
  {
    question: "Kurā gadā cilvēks pirmo reizi izkāpa uz Mēness?",
    answers: [
      { text: "1965", correct: false },
      { text: "1972", correct: false },
      { text: "1975", correct: false },
      { text: "1969", correct: true },
    ],
  },
  {
    question: "Kas ir izgudrojis telefonu?",
    answers: [
      { text: "Nikolā Tesla", correct: false },
      { text: "Aleksandrs Bells", correct: true },
      { text: "Tomass Edisons", correct: false },
      { text: "Alberts Einšteins", correct: false },
    ],
  },
  {
    question: "Kas ir rakstījis grāmatu “Harijs Poters un Filozofu akmens”?",
    answers: [
      { text: "J.K. Roulinga", correct: true },
      { text: "Džordžs R.R. Mārtins", correct: false },
      { text: "Dzons Grīns", correct: false },
      { text: "Stīvens Kings", correct: false },
    ],
  },
  {
    question: "Kura valsts rīko Olimpiskās spēles 2024. gadā?",
    answers: [
      { text: "Itālija", correct: false },
      { text: "Japāna", correct: false },
      { text: "Francija", correct: true },
      { text: "ASV", correct: false },
    ],
  },
  {
    question: "Kurš ir augstākais ūdenskritums pasaulē?",
    answers: [
      { text: "Niagāras ūdenskritums", correct: false },
      { text: "Anhela ūdenskritums", correct: true },
      { text: "Viktorijas ūdenskritums", correct: false },
      { text: "Iguazu ūdenskritums", correct: false },
    ],
  },
  {
    question: "Kurā gadā Latvija kļuva par Eiropas Savienības dalībvalsti?",
    answers: [
      { text: "2004", correct: true },
      { text: "1999", correct: false },
      { text: "2007", correct: false },
      { text: "2014", correct: false },
    ],
  },
  {
    question: "Kurā gadā tika uzcelta Akropolis?",
    answers: [
      { text: "2019 ", correct: true },
      { text: "2018", correct: false },
      { text: "2021", correct: false },
      { text: "2016", correct: false },
    ],
  },
];

startQuiz();

function startQuiz() {
  score = 0;
  questionContainer.style.display = "flex";
  shuffledQuestions = questions.sort(() => Math.random() - 0.5);
  currentQuestionIndex = 0;
  nextButton.classList.remove("hide");
  restartButton.classList.add("hide");
  resultDiv.classList.add("hide");
  setNextQuestion();
}

function setNextQuestion() {
  resetState();
  showQuestion(shuffledQuestions[currentQuestionIndex]);
}

function showQuestion(question) {
  questionElement.innerText = question.question;
  question.answers.forEach((answer, index) => {
    const inputGroup = document.createElement("div");
    inputGroup.classList.add("input-group");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.id = "answer" + index;
    radio.name = "answer";
    radio.value = index;

    const label = document.createElement("label");
    label.htmlFor = "answer" + index;
    label.innerText = answer.text;

    inputGroup.appendChild(radio);
    inputGroup.appendChild(label);
    answerButtons.appendChild(inputGroup);
  });
}

function resetState() {
  while (answerButtons.firstChild) {
    answerButtons.removeChild(answerButtons.firstChild);
  }
}

nextButton.addEventListener("click", () => {
  const answerIndex = Array.from(
    answerButtons.querySelectorAll("input")
  ).findIndex((radio) => radio.checked);
  if (answerIndex !== -1) {
    if (shuffledQuestions[currentQuestionIndex].answers[answerIndex].correct) {
      score++;
      showFeedback(true);
    } else {
      showFeedback(false);
    }
  } else {
    alert("Lūdzu, atlasiet atbildi.");
  }
});

restartButton.addEventListener("click", startQuiz);

function showFeedback(isCorrect) {
  const feedback = document.createElement("div");
  feedback.innerText = isCorrect ? "Pareizi!" : "Nepareizi!";
  feedback.classList.add("feedback");
  questionContainer.appendChild(feedback);
  setTimeout(() => {
    questionContainer.removeChild(feedback);
    currentQuestionIndex++;
    if (shuffledQuestions.length > currentQuestionIndex) {
      setNextQuestion();
    } else {
      endQuiz();
    }
  }, 1000);
}

function endQuiz() {
  questionContainer.style.display = "none";
  nextButton.classList.add("hide");
  restartButton.classList.remove("hide");
  resultDiv.classList.remove("hide");
  resultDiv.innerText = `Jūs ieguvāt ${score} / ${shuffledQuestions.length} punktus`;
}
