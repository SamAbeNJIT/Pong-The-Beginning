#include <SFML/Graphics.hpp>
#include <string>
#include <time.h>
#include <iostream>

using namespace std;
using namespace sf;

void test()
	{

		

    // create the window
    RenderWindow window(sf::VideoMode(800, 800), "Pong: The Beginning");
	CircleShape shape(10);
	shape.setFillColor(sf::Color(1, 1, 1));

	shape.setOutlineThickness(5);
	shape.setOutlineColor(sf::Color(250, 250, 250));

	RectangleShape line(sf::Vector2f(1, 5));
	line.rotate(90);

	int fps = 0;
	int startTime = time(NULL);
	int endTime = time(NULL)+1;

	Vector2f pullVector(0.0f, 0.001f);
	Vector2f velocity(-100.0f, -100.0f);
	Vector2f position(400.0f, 400.0f);

	sf::Clock deltaClock;

    while (window.isOpen())
    {

		Time deltaTime = deltaClock.restart();

		pullVector.y+=0.0001;

        sf::Event event;
        while (window.pollEvent(event))
        {
            if (event.type == sf::Event::Closed)
                window.close();
        }

		fps++;
		endTime = time(NULL);
		if(fps % 1000 == 0)
			cout << (fps/(endTime-startTime+1)) << endl;

		//drawing section
		{
			window.clear(sf::Color::Black);

			position = position + velocity * deltaTime.asSeconds();
			shape.setPosition(position);
			
			window.draw(shape);

			window.display();
		}
		
	cout<<"1. Start"<<endl;
	cout<<"2. Exit"<<endl;

	int selection;
	cin>>selection;


	if (selection == 2)
	
	{
		cout<<"Bye bye"<<endl;
	}

	if(selection == 1)
	
	{
		cout<<"Welcome to Pong!"<<endl;
		cout<<"1. One player"<<endl;
		cout<<"2. Two players"<<endl;
		cin>>selection;

		if(selection==1)
		
		{
			cout<<"You have selected one player"<<endl;
			test();
			
		}

		if(selection==2)
		{
			cout<<"You have selected two players!"<<endl;
			test();
		
		}
	}

	system("pause");
    }


	



    return;

}
int main()
{    
	RenderWindow App(VideoMode(800,600,32),"Pong: The Beginning");
	
	sf::Image iCharacter;
	if (!iCharacter.loadFromFile("bar.png"))
		return EXIT_FAILURE; 


	while (App.isOpen())
	{
		Event Event;
		while (App.GetEvent (Event))
		{
			if (Event.type == Event::Closed)
				App.close();

			if (Event.type == Event.KeyPressed) (Event.key.code == key)
				App.close();
		}

		float ElaspedTime = App.();

	if (App.GetInput().IsKeyDown(sf::Key::Left))			sCharacter.move(-100 * ElaspedTime)
	if (App.GetInput().IsKeyDown(sf::Key::Right))   sCharacter.Move(100 * ElaspedTime)
	if (App.GetInput().IsKeyDown(sf::Key::Up))		sCharacter.Move(0, 100 * ElaspedTime)
	if (App.GetInput().IsKeyDown (sf::Key::Down))	sCharacter.Move(0, -100 * Elasped Time)

	App.Clear(Color(255,0,0);
	App.Draw(sCharacter);
	App.Display();

	}
	return EXIT_SUCCESS;
}
