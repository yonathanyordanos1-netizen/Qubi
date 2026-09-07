import FriendsScreen from '../../src/screens/FriendsScreen';
export default function FriendsRoute({ navigation }: any) {
  return <FriendsScreen onBack={() => navigation?.goBack?.()} />;
}
