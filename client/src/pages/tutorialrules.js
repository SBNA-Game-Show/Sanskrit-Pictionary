import './tutorialrules.css';

function TutorialRules() {
    return(
    <div className="tutorialRulesContainer">

        <h1>Tutorial & Rules</h1>
        <ol>
            <li>🤝 Team-based multiplayer game to learn Sanskrit vocabulary.</li>
            <li>✍️ One player is chosen as the drawer and sees a  flashcard then sketches the word using a simple canvas.</li>
            <li>💬 Other players from same team guess the word in real-time by typing in chat.</li>
            <li>🧠 Hints are given over time during each game session.</li>
            <li>🎴 After each round, flashcards are shown to all team members.</li>
            <li>📘 Words guessed are recorded in a Word History.</li>
        </ol>

        <h1>Keep in mind</h1>
        <ul>
            <li>🚫 No writing the word or any letters explicitly.</li>
            <li>🎨 Only drawing is allowed.</li>
            <li>🕒 Points awarded based on guessing speed and accuracy.</li>
        </ul>

    </div>
    );
}

export default TutorialRules;