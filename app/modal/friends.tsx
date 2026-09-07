import FriendsScreen from '../../src/screens/FriendsScreen';
export default function FriendsModalRoute({ navigation }: any) {
  return <FriendsScreen onBack={() => navigation?.goBack?.()} />;
}
