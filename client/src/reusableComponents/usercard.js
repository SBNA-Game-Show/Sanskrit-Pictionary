import './usercard.css';

function UserCard({ imageSrc, name, points }) {
  return (
    <div className="usercard">
      <img src={imageSrc} alt={`${name}'s avatar`} className="usercard-image" />
      <div className="usercard-name">{name}</div>
      <div className="usercard-points">{points} pts</div>
    </div>
  );
}

export default UserCard;
