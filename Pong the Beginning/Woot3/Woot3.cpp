#include <SFML/Graphics.hpp>
#include <string>
#include <time.h>
#include <iostream>
#include "Bar.h"
#pragma once

using namespace std;
using namespace sf;

Bar* bar1;
RenderWindow* window;
CircleShape* shape;

int fps = 0;
int startTime = time(NULL);
int endTime = time(NULL)+1;

Vector2f pullVector(0.0f, 0.001f);
Vector2f velocity(-100.0f, 100.0f);
Vector2f position(400.0f, 400.0f);

void test()
{    
	sf::Image iCharacter;
	iCharacter.loadFromFile("test.png");
}

void init()
{
	window = new RenderWindow(VideoMode(800, 800), "Pong: The Beginning");

	shape = new CircleShape(10);
	shape->setFillColor(Color(1, 1, 1));

	shape->setOutlineThickness(5);
	shape->setOutlineColor(sf::Color(250, 250, 250));

	bar1 = new Bar();
}

void update(float deltaTime)
{
	Vector2f move(0,0);

	if (Keyboard::isKeyPressed(Keyboard::Up))
	{
		move.x = move.x - bar1->speed;
	}
	if (sf::Keyboard::isKeyPressed(sf::Keyboard::Down))
	{
		move.x = move.x + bar1->speed;
	}
	bar1->move( move * deltaTime);
}

void draw(float deltaTime)
{
	window->clear(sf::Color::Black);

	window->draw(*shape);
	window->draw(*bar1->rec);

	window->display();
}

int main()
{
	int selection;

	//get number of players
	cout<<"Welcome to Pong!"<<endl;
	cout<<"1. One player"<<endl;
	cout<<"2. Two players"<<endl;
	cin>>selection;

	if(selection==1)
	{
		cout<<"You have selected one player"<<endl;

	}
	else if(selection==2)
	{
		cout<<"You have selected two players!"<<endl;
	}


	init();
		
	sf::Clock deltaClock;

	while (window->isOpen())
	{
		Time deltaTime = deltaClock.restart();

		//write fps every 1000 frames
		fps++;
		endTime = time(NULL);
		if(fps % 1000 == 0)
			cout << (fps/(endTime-startTime+1)) << endl;

		update(deltaTime.asSeconds());

		draw(deltaTime.asSeconds());

			
	}
}

